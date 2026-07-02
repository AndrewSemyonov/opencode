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

  test("falls back to the filename's generation date when the link text isn't a full date", () => {
    // No year — not recognized as a date, falls through to the filename.
    expect(reportLinkDate("  за 21 июня  ", "reports/x-2026-06-22-11:54.mdx")).toBe("22 июня 2026")
    expect(reportLinkDate("  за 21 июня  ")).toBe("") // and no href at all -> no date
    // Free text (not a date) is ignored in favor of the filename date.
    expect(reportLinkDate("отчёт", "reports/top-3-dishes-2026-07-02-13:10.mdx")).toBe("2 июля 2026")
  })

  test("shows no date for a bare report path with no href to fall back to", () => {
    expect(reportLinkDate("reports/guests-2026-06-22-11:54.mdx")).toBe("")
    expect(reportLinkDate("")).toBe("")
  })

  test("bare report path AS TEXT still resolves a date from href (the filename date)", () => {
    expect(reportLinkDate("reports/guests-2026-06-22-11:54.mdx", "reports/guests-2026-06-22-11:54.mdx")).toBe(
      "22 июня 2026",
    )
  })

  test("no date at all when the filename carries no date either", () => {
    expect(reportLinkDate("", "reports/no-date-name.mdx")).toBe("")
    expect(reportLinkDate("отчёт", "reports/no-date-name.mdx")).toBe("")
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

  test("a bare auto-linked path picks up the filename's generation date", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<a class="external-link" href="reports/x-2026-06-22-11:54.mdx">reports/x-2026-06-22-11:54.mdx</a>'
    markReportLinks(root, label)
    expect(root.querySelector("a")!.textContent).toBe("Отобразить отчёт 22 июня 2026")
  })

  test("no date at all when the filename itself carries no date", () => {
    const root = document.createElement("div")
    root.innerHTML = '<a href="reports/report.mdx">reports/report.mdx</a>'
    markReportLinks(root, label)
    expect(root.querySelector("a")!.textContent).toBe("Отобразить отчёт")
  })

  test("free text link content (not a date) is replaced by the filename date", () => {
    const root = document.createElement("div")
    root.innerHTML = '<a href="reports/top-3-dishes-2026-07-02-13:10.mdx">отчёт</a>'
    markReportLinks(root, label)
    expect(root.querySelector("a")!.textContent).toBe("Отобразить отчёт 2 июля 2026")
  })

  test("leaves non-report links untouched", () => {
    const root = document.createElement("div")
    root.innerHTML = '<a class="external-link" href="src/app.ts">src/app.ts</a>'
    markReportLinks(root, label)
    const a = root.querySelector("a")!
    expect(a.classList.contains("report-open-link")).toBe(false)
    expect(a.textContent).toBe("src/app.ts")
  })

  test("strips a duplicate date stated in prose right before the link", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<p>Управленческий вывод: перепроверьте позиции. 29 июня 2026 <a href="reports/x-2026-06-29-09:15.mdx">отчёт</a></p>'
    markReportLinks(root, label)
    const p = root.querySelector("p")!
    expect(p.querySelector("a")!.textContent).toBe("Отобразить отчёт 29 июня 2026")
    expect(p.textContent).toBe("Управленческий вывод: перепроверьте позиции. Отобразить отчёт 29 июня 2026")
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
