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

  test("rejects non-report paths", () => {
    expect(isReportPath("src/app.ts")).toBe(false)
    expect(isReportPath("docs/reports/notes.md")).toBe(false) // not at root
    expect(isReportPath("reports/report.md")).toBe(false) // viewer needs .mdx
    expect(isReportPath("reportsx/report.mdx")).toBe(false)
  })
})

describe("reportLinkDate", () => {
  test("uses the agent-written date as the button date", () => {
    expect(reportLinkDate("21 июня 2026")).toBe("21 июня 2026")
    expect(reportLinkDate("  за 21 июня  ")).toBe("за 21 июня")
  })

  test("shows no date for a bare report path (avoids a misleading generation date)", () => {
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

  test("bare report path gets a dateless label", () => {
    const root = document.createElement("div")
    root.innerHTML = '<a href="reports/report.mdx">reports/report.mdx</a>'
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
