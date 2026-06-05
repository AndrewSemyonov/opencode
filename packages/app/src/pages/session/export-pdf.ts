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
 *   3. Inject the cloned MDX, wait for stylesheets, fonts AND every image
 *      inside the clone to finish loading before triggering print.
 *   4. Set `document.title` on the host page to the report name → becomes
 *      the default PDF filename in the browser print dialog.
 *   5. Subscribe to `afterprint` BEFORE calling `print()` (in some browsers
 *      the event fires synchronously, so registering it afterwards misses
 *      it and leaks the iframe), then call `print()`. Clean up the iframe
 *      on `afterprint`. If `afterprint` ever fails to fire, the orphan
 *      iframe is swept at the start of the next print — a timer here would
 *      otherwise tear the iframe down mid-dialog if the user lingered in
 *      Save-as-PDF longer than the timeout.
 */
const PDF_IFRAME_MARKER = "opencode-pdf-export"

export async function exportElementToPdf(el: HTMLElement, filename: string): Promise<void> {
  const docTitle = filename.replace(/\.pdf$/i, "")

  // Sweep iframes left over from prior prints where `afterprint` never
  // fired. Defence in depth instead of a timer — caps the leak at one
  // orphan in the DOM at any time without risking a mid-dialog teardown.
  for (const orphan of document.querySelectorAll<HTMLIFrameElement>(
    `iframe[data-purpose="${PDF_IFRAME_MARKER}"]`,
  )) {
    orphan.remove()
  }

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
  iframe.dataset.purpose = PDF_IFRAME_MARKER
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

  // Wire teardown immediately so any throw between here and print() doesn't
  // leak the iframe. `cleanedUp` plus the `isConnected` check makes teardown
  // safely idempotent across afterprint and the error path below.
  let cleanedUp = false
  const teardown = () => {
    if (cleanedUp) return
    cleanedUp = true
    if (iframe.isConnected) iframe.remove()
  }

  try {
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) {
      teardown()
      throw new Error("Failed to create print iframe")
    }

    const headHtml = styleNodes
      .map((node) => {
        if (node.tagName === "LINK") {
          const link = node as HTMLLinkElement
          return `<link rel="stylesheet" href="${link.href}">`
        }
        const styleEl = node as HTMLStyleElement
        // Escape any literal `</style>` inside the CSS text (CSS comments,
        // injected source maps) so the iframe HTML parser doesn't terminate
        // the style tag early. Backslash before `/` keeps the CSS valid.
        const css = (styleEl.textContent ?? "").replace(/<\/style/gi, "<\\/style")
        return `<style>${css}</style>`
      })
      .join("\n")

    // Mirror the host theme 1:1 (lang, data-theme, data-color-scheme, class,
    // inline style). No CSS-variable overrides — the PDF inherits whichever
    // theme is currently applied in the app. If the user later switches or
    // adds a new theme it is picked up automatically.
    const hostHtml = document.documentElement
    const themeId = hostHtml.dataset.theme ?? "void0"
    const hostInlineStyle = hostHtml.getAttribute("style") ?? ""
    const hostClass = hostHtml.className
    const hostColorScheme = hostHtml.dataset.colorScheme ?? "dark"
    const hostLang = hostHtml.lang || "en"

    doc.open()
    doc.write(`<!doctype html>
<html lang="${escapeHtml(hostLang)}" class="${escapeHtml(hostClass)}" data-theme="${escapeHtml(themeId)}" data-color-scheme="${escapeHtml(hostColorScheme)}" style="${escapeHtml(hostInlineStyle)}">
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

    // 4) Wait for stylesheets, fonts and every <img> inside the clone to
    // finish loading. Skipping the image wait means the first export can
    // print a half-decoded report on slow connections / cold caches.
    await waitForIframeReady(iframe)
    await waitForImagesLoaded(doc.body, 5_000)

    // 5) Register afterprint BEFORE print(). In Firefox/Safari `print()` is
    // async — restoring the host title in a `finally` block races the
    // dialog, which then suggests the host-page title as the PDF filename.
    // Restoring inside `afterprint` keeps the doc title in place until the
    // browser has actually read it for the filename suggestion.
    const prevHostTitle = document.title
    win.addEventListener(
      "afterprint",
      () => {
        if (document.title === docTitle) document.title = prevHostTitle
        teardown()
      },
      { once: true },
    )

    document.title = docTitle
    win.focus()
    win.print()
  } catch (err) {
    teardown()
    throw err
  }
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
  // Give layout a paint to settle. Guard against the iframe being detached
  // between awaits — contentWindow becomes null and a non-null assertion
  // would throw before the outer teardown can run.
  const win = iframe.contentWindow
  if (!win) return
  await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()))
}

/**
 * Wait until every <img> inside `root` has finished loading (or failed).
 * Uses `decode()` when available — it resolves only after the image is
 * actually decoded and ready to paint, which is what we need before
 * handing the document to the print engine. Falls back to the load/error
 * event pair for legacy browsers and data: URLs that `decode()` rejects.
 *
 * A per-image timeout prevents a single stuck image from blocking the
 * whole export. Errors and timeouts resolve (don't reject) — we'd rather
 * print a placeholder than refuse the user a PDF.
 */
async function waitForImagesLoaded(root: HTMLElement, perImageTimeoutMs: number): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"))
  if (images.length === 0) return

  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          const done = () => resolve()

          // Already loaded and decoded.
          if (img.complete && img.naturalWidth > 0) {
            if (typeof img.decode === "function") {
              img.decode().then(done, done)
              return
            }
            done()
            return
          }

          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            img.removeEventListener("load", onLoad)
            img.removeEventListener("error", onError)
            clearTimeout(timer)
            resolve()
          }
          const onLoad = () => {
            if (typeof img.decode === "function") {
              img.decode().then(finish, finish)
            } else {
              finish()
            }
          }
          const onError = () => finish()
          img.addEventListener("load", onLoad, { once: true })
          img.addEventListener("error", onError, { once: true })
          const timer = setTimeout(finish, perImageTimeoutMs)
        }),
    ),
  )
}

export function pdfFilenameFromPath(path: string | undefined | null): string {
  const raw = (path ?? "").split(/[\\/]/).pop() ?? "report"
  const base = raw.replace(/\.mdx?$/i, "") || "report"
  return `${base}.pdf`
}
