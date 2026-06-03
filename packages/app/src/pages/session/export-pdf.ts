/**
 * Print the given MDX element to PDF by cloning it into an isolated iframe
 * and triggering the browser's print dialog from there.
 *
 * Why an iframe and not in-page print CSS:
 *   - The MDX viewer normally lives inside the session side-panel or the
 *     standalone /file route. Both are flex layouts with fixed inner widths.
 *     `@media print` rules can't reliably override every parent constraint,
 *     so the printed content ends up shrunken to its original on-screen size.
 *   - An iframe gives a clean `<html>/<body>` chrome where the MDX can flow
 *     to full A4 width without fighting the host layout.
 *
 * Pipeline:
 *   1. Serialize every `<canvas>` inside the target to a PNG so the clone
 *      keeps the chart.js bitmaps (cloneNode does not copy canvas content).
 *   2. Build an offscreen iframe with the same stylesheets as the host page
 *      (so MDX components keep their typography / theming).
 *   3. Inject the cloned MDX, wait for resources to load.
 *   4. Set `document.title` on the iframe to the report name → becomes the
 *      default PDF filename in browser print dialogs.
 *   5. Call `print()` on the iframe's window. Clean up the iframe afterwards.
 */
export async function exportElementToPdf(el: HTMLElement, filename: string): Promise<void> {
  const docTitle = filename.replace(/\.pdf$/i, "")

  // 1) Snapshot canvases (charts) before cloning — bitmaps are not cloneable.
  const canvasSnapshots = new Map<HTMLCanvasElement, string>()
  el.querySelectorAll("canvas").forEach((canvas) => {
    try {
      canvasSnapshots.set(canvas, canvas.toDataURL("image/png"))
    } catch {
      // Tainted canvas — skip; will render as blank in clone.
    }
  })

  const clone = el.cloneNode(true) as HTMLElement
  clone.removeAttribute("data-pdf-print-root")
  clone.style.maxWidth = "100%"
  clone.style.width = "100%"
  clone.style.margin = "0"
  clone.style.padding = "0"

  // Match each canvas in the clone (same DOM order) and replace with <img>.
  const originalCanvases = Array.from(el.querySelectorAll("canvas"))
  const cloneCanvases = Array.from(clone.querySelectorAll("canvas"))
  originalCanvases.forEach((src, i) => {
    const tgt = cloneCanvases[i]
    if (!tgt) return
    const dataUrl = canvasSnapshots.get(src)
    if (!dataUrl) return
    const img = clone.ownerDocument.createElement("img")
    img.src = dataUrl
    img.style.cssText = src.getAttribute("style") ?? ""
    img.style.display = "block"
    img.style.maxWidth = "100%"
    img.style.height = "auto"
    img.width = src.width
    img.height = src.height
    tgt.replaceWith(img)
  })

  // 2) Collect host stylesheets so the clone keeps its look.
  const styleNodes = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]'),
  ) as Array<HTMLStyleElement | HTMLLinkElement>

  // 3) Build the iframe.
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText = [
    "position: fixed",
    "left: -99999px",
    "top: 0",
    "width: 794px", // A4 width at 96dpi
    "height: 1123px",
    "border: 0",
    "visibility: hidden",
    "pointer-events: none",
  ].join("; ")
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    throw new Error("Failed to create print iframe")
  }

  const headHtml = styleNodes
    .map((node) => {
      if (node.tagName === "LINK") {
        const link = node as HTMLLinkElement
        return `<link rel="stylesheet" href="${link.href}">`
      }
      const styleEl = node as HTMLStyleElement
      return `<style>${styleEl.textContent ?? ""}</style>`
    })
    .join("\n")

  // Mirror the host theme so CSS variables resolve consistently, but force
  // `data-color-scheme="light"` because PDFs are typically read on white.
  const hostHtml = document.documentElement
  const themeId = hostHtml.dataset.theme ?? "void0"
  const hostInlineStyle = hostHtml.getAttribute("style") ?? ""
  const hostClass = hostHtml.className

  // Match the host theme 1:1 (data-theme, data-color-scheme, class, inline style).
  // No CSS-variable overrides — the PDF inherits whichever theme is currently
  // applied in the app. If the user later switches/renames the theme it will
  // be picked up automatically; nothing here is theme-specific.
  const hostColorScheme = hostHtml.dataset.colorScheme ?? "dark"

  doc.open()
  doc.write(`<!doctype html>
<html lang="ru" class="${escapeHtml(hostClass)}" data-theme="${escapeHtml(themeId)}" data-color-scheme="${escapeHtml(hostColorScheme)}" style="${escapeHtml(hostInlineStyle)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(docTitle)}</title>
${headHtml}
<style>
  /*
   * @page { margin: 0 } removes the browser's default print header/footer
   * (URL, page number, timestamp) — Chromium has nowhere to put them when
   * the page margin is zero. We shift the visual margin to body padding so
   * the content still gets breathing room from the paper edge.
   */
  @page { size: A4; margin: 0; }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--background-base, #ffffff);
    color: var(--text-base, #111);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    padding: 12mm 14mm;
    box-sizing: border-box;
  }
  body, body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /*
   * Paint the themed background on EVERY printed page, not just where the
   * body element reaches. \`position: fixed\` elements are repeated on each
   * page by Chromium's print engine, so this fills paper that's otherwise
   * left white when body overflows just past a page boundary.
   */
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    background: var(--background-base, #ffffff);
    z-index: -1;
    pointer-events: none;
  }

  /*
   * The MdxViewer sets its own padding (24px 28px 80px) and max-width
   * (min(960px, 100%)) inline. For print we want the whole page width and
   * tighter bottom padding so content has a better chance of fitting on
   * fewer pages.
   */
  [data-mdx-viewer="true"] {
    padding: 0 !important;
    max-width: 100% !important;
    margin: 0 !important;
  }

  /* Avoid bad page breaks inside cards / charts. */
  pre, table, figure, img, canvas, svg,
  [data-component="callout"],
  [data-component="card"],
  [data-component="kpi"],
  [data-component="stat"] {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  h1, h2, h3 {
    break-after: avoid;
    page-break-after: avoid;
  }
</style>
</head>
<body></body>
</html>`)
  doc.close()

  doc.body.appendChild(doc.adoptNode(clone))

  // 4) Wait for stylesheets and fonts to be ready.
  await waitForIframeReady(iframe)

  const prevHostTitle = document.title
  document.title = docTitle
  try {
    win.focus()
    win.print()
  } finally {
    document.title = prevHostTitle
  }

  // 5) Clean up. Browsers often pause execution during `print()`, so by the
  // time we reach here the user has already dismissed the dialog. Wait a
  // tick to be safe, then remove. Also schedule a longer fallback in case
  // print is still open.
  const teardown = () => {
    if (iframe.isConnected) iframe.remove()
  }
  win.addEventListener("afterprint", teardown, { once: true })
  setTimeout(teardown, 60_000)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

async function waitForIframeReady(iframe: HTMLIFrameElement): Promise<void> {
  const doc = iframe.contentDocument
  if (!doc) return

  if (doc.readyState !== "complete") {
    await new Promise<void>((resolve) => {
      const onLoad = () => {
        iframe.removeEventListener("load", onLoad)
        resolve()
      }
      iframe.addEventListener("load", onLoad, { once: true })
      // Fallback in case `load` doesn't fire (e.g. inline-only docs)
      setTimeout(() => resolve(), 2000)
    })
  }

  // Wait for stylesheets to actually apply + fonts to load.
  try {
    const fonts = (doc as any).fonts
    if (fonts?.ready) await fonts.ready
  } catch {
    // ignore
  }
  // Give layout a paint to settle.
  await new Promise<void>((resolve) =>
    iframe.contentWindow!.requestAnimationFrame(() => resolve()),
  )
}

export function pdfFilenameFromPath(path: string | undefined | null): string {
  const raw = (path ?? "").split(/[\\/]/).pop() ?? "report"
  const base = raw.replace(/\.mdx?$/i, "") || "report"
  return `${base}.pdf`
}
