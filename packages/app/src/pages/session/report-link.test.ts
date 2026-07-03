import { describe, expect, mock, test } from "bun:test"
import { dict as uiEn } from "@opencode-ai/ui/i18n/en"
import {
  isReportPath,
  markReportLinks,
  reportLinkDate,
  setupLinkInterception,
} from "@opencode-ai/ui/markdown"

// The report-open-button logic lives in @opencode-ai/ui (markdown.tsx), but the
// ui package has no CI test task and its DOM tests need a browser environment.
// This suite lives in the app package, whose test:ci preloads happy-dom and runs
// under `bun turbo test:ci`, so the load-bearing feature logic is actually
// covered in CI: the DOM relabel and the report/local click routing.

const label = (date: string) => `Отобразить отчёт ${date}`.trim()

describe("isReportPath", () => {
  test("matches report .mdx paths (with or without ./, tolerating the line-anchor query)", () => {
    expect(isReportPath("reports/guests-2026-06-22-11:54.mdx")).toBe(true)
    expect(isReportPath("./reports/report.mdx")).toBe(true)
    expect(isReportPath("reports/report.mdx?start=5&end=5")).toBe(true)
  })

  test("matches a nested or absolute reports/ prefix too", () => {
    expect(isReportPath("/workspace/reports/x.mdx")).toBe(true)
    expect(isReportPath("docs/reports/notes.mdx")).toBe(true)
  })

  test("rejects non-report paths", () => {
    expect(isReportPath("src/app.ts")).toBe(false)
    expect(isReportPath("docs/reports/notes.md")).toBe(false) // wrong extension, not the nesting
    expect(isReportPath("reports/report.md")).toBe(false) // viewer needs .mdx
    expect(isReportPath("reportsx/report.mdx")).toBe(false)
  })
})

describe("reportLinkDate", () => {
  test("uses the agent-written date as the button date when it's a full date", () => {
    expect(reportLinkDate("21 июня 2026")).toBe("21 июня 2026")
    expect(reportLinkDate("за 21 июня 2026 г.")).toBe("за 21 июня 2026 г.")
  })

  test("never derives a date from anything that isn't a full date", () => {
    // No year — not a full date.
    expect(reportLinkDate("  за 21 июня  ")).toBe("")
    // Free text is not a date; the filename's generation timestamp is
    // deliberately NOT used (it can differ from the report's data period).
    expect(reportLinkDate("отчёт")).toBe("")
    // Bare paths never count as dates.
    expect(reportLinkDate("reports/guests-2026-06-22-11:54.mdx")).toBe("")
    expect(reportLinkDate("")).toBe("")
  })
})

describe("markReportLinks (DOM relabel)", () => {
  test("turns a dated report link into a button labelled with the date", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<a class="external-link" target="_blank" rel="noopener noreferrer" href="reports/guests-2026-06-22-11:54.mdx">21 июня 2026</a>'
    markReportLinks(root, label)
    const a = root.querySelector("a")!
    expect(a.textContent).toBe("Отобразить отчёт 21 июня 2026")
    expect(a.classList.contains("report-open-link")).toBe(true)
    expect(a.classList.contains("external-link")).toBe(false)
    expect(a.getAttribute("role")).toBe("button")
    expect(a.hasAttribute("target")).toBe(false)
    expect(a.hasAttribute("rel")).toBe(false)
  })

  test("a bare auto-linked path stays dateless (filename timestamp is not the report's date)", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<a class="external-link" href="reports/x-2026-06-22-11:54.mdx">reports/x-2026-06-22-11:54.mdx</a>'
    markReportLinks(root, label)
    expect(root.querySelector("a")!.textContent).toBe("Отобразить отчёт")
  })

  test("no date at all when the filename itself carries no date", () => {
    const root = document.createElement("div")
    root.innerHTML = '<a href="reports/report.mdx">reports/report.mdx</a>'
    markReportLinks(root, label)
    expect(root.querySelector("a")!.textContent).toBe("Отобразить отчёт")
  })

  test("free text link content with no date anywhere stays dateless", () => {
    const root = document.createElement("div")
    root.innerHTML = '<a href="reports/top-3-dishes-2026-07-02-13:10.mdx">отчёт</a>'
    markReportLinks(root, label)
    expect(root.querySelector("a")!.textContent).toBe("Отобразить отчёт")
  })

  test("leaves non-report links untouched", () => {
    const root = document.createElement("div")
    root.innerHTML = '<a class="external-link" href="src/app.ts">src/app.ts</a>'
    markReportLinks(root, label)
    const a = root.querySelector("a")!
    expect(a.classList.contains("report-open-link")).toBe(false)
    expect(a.textContent).toBe("src/app.ts")
  })

  test("adopts (and strips) the report date the agent stated in prose right before the link", () => {
    const root = document.createElement("div")
    // Filename says June 30 (generation), prose says June 29 (report period) —
    // the button must show the PROSE date, proving the filename is never used.
    root.innerHTML =
      '<p>Управленческий вывод: перепроверьте позиции. 29 июня 2026 <a href="reports/x-2026-06-30-09:15.mdx">отчёт</a></p>'
    markReportLinks(root, label)
    const p = root.querySelector("p")!
    expect(p.querySelector("a")!.textContent).toBe("Отобразить отчёт 29 июня 2026")
    expect(p.textContent).toBe("Управленческий вывод: перепроверьте позиции. Отобразить отчёт 29 июня 2026")
  })

  test("strips the prose date when it duplicates the link-text date", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<p>Вывод: всё ок. 29 июня 2026 <a href="reports/x.mdx">29 июня 2026</a></p>'
    markReportLinks(root, label)
    const p = root.querySelector("p")!
    expect(p.textContent).toBe("Вывод: всё ок. Отобразить отчёт 29 июня 2026")
  })

  test("is idempotent across re-decoration of freshly parsed nodes", () => {
    const html =
      '<a href="reports/x-2026-06-22.mdx">21 июня 2026</a>'
    const first = document.createElement("div")
    first.innerHTML = html
    markReportLinks(first, label)
    const second = document.createElement("div")
    second.innerHTML = html
    markReportLinks(second, label)
    expect(first.querySelector("a")!.textContent).toBe(second.querySelector("a")!.textContent)
    expect(second.querySelector("a")!.textContent).toBe("Отобразить отчёт 21 июня 2026")
  })
})

describe("setupLinkInterception (click routing)", () => {
  const leftClick = (el: Element) => el.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true }))

  test("routes report links to openReport and others to openLocalFile", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<a id="rep" href="reports/x.mdx">d</a><a id="file" href="src/a.ts">f</a>'
    document.body.appendChild(root)
    const openLocal = mock((_: string) => {})
    const openReport = mock((_: string) => {})
    const cleanup = setupLinkInterception(root, openLocal, openReport)

    leftClick(root.querySelector("#rep")!)
    expect(openReport).toHaveBeenCalledWith("reports/x.mdx")
    expect(openLocal).not.toHaveBeenCalled()

    leftClick(root.querySelector("#file")!)
    expect(openLocal).toHaveBeenCalledWith("src/a.ts")
    expect(openReport).toHaveBeenCalledTimes(1)

    cleanup()
    root.remove()
  })

  test("falls back to openLocalFile for reports when no report opener is provided", () => {
    const root = document.createElement("div")
    root.innerHTML = '<a id="rep" href="reports/x.mdx">d</a>'
    document.body.appendChild(root)
    const openLocal = mock((_: string) => {})
    const cleanup = setupLinkInterception(root, openLocal, undefined)

    leftClick(root.querySelector("#rep")!)
    expect(openLocal).toHaveBeenCalledWith("reports/x.mdx")

    cleanup()
    root.remove()
  })
})

describe("report button label i18n fallback", () => {
  test("ui dictionary defines session.report.display so standalone Markdown shows a label, not the raw key", () => {
    expect(uiEn["session.report.display"]).toBeDefined()
    expect(uiEn["session.report.display"]).toContain("{{date}}")
  })
})
