import { describe, expect, test } from "bun:test"
import { isReportPath, previewablePath, reportLinkDate } from "./markdown"

describe("previewablePath", () => {
  test("keeps relative file links previewable", () => {
    expect(previewablePath("src/app.ts")).toBe("src/app.ts")
  })

  test("supports absolute file links with line suffix", () => {
    expect(previewablePath("/repo/src/app.ts:12")).toBe("/repo/src/app.ts?start=12&end=12")
  })

  test("supports yaml file links", () => {
    expect(previewablePath("docker-compose.yml")).toBe("docker-compose.yml")
  })

  test("supports filename-only paths without dot when explicitly allowed", () => {
    expect(previewablePath("Dockerfile")).toBe("Dockerfile")
  })

  test("ignores web urls", () => {
    expect(previewablePath("https://example.com/app.ts")).toBeUndefined()
  })

  test("supports windows absolute file links", () => {
    expect(previewablePath("C:/repo/src/app.ts:7")).toBe("C:/repo/src/app.ts?start=7&end=7")
  })

  test("supports common dotfiles", () => {
    expect(previewablePath(".gitignore")).toBe(".gitignore")
    expect(previewablePath("/Users/me/repo/.gitignore")).toBe("/Users/me/repo/.gitignore")
    expect(previewablePath("packages/app/.gitignore:5")).toBe("packages/app/.gitignore?start=5&end=5")
    expect(previewablePath(".editorconfig")).toBe(".editorconfig")
    expect(previewablePath(".npmrc")).toBe(".npmrc")
  })

  test("supports extensionless project files", () => {
    expect(previewablePath("LICENSE")).toBe("LICENSE")
    expect(previewablePath("README")).toBe("README")
    expect(previewablePath("CHANGELOG")).toBe("CHANGELOG")
    expect(previewablePath("path/to/LICENSE:42")).toBe("path/to/LICENSE?start=42&end=42")
  })

  test("keeps report file links previewable", () => {
    expect(previewablePath("reports/report-2026-05-19.mdx")).toBe("reports/report-2026-05-19.mdx")
    expect(previewablePath("reports/report.mdx:12")).toBe("reports/report.mdx?start=12&end=12")
  })
})

describe("isReportPath", () => {
  test("matches report .mdx paths (with or without ./)", () => {
    expect(isReportPath("reports/guests-2026-06-22-11:54.mdx")).toBe(true)
    expect(isReportPath("./reports/report.mdx")).toBe(true)
  })

  test("tolerates the line-anchor query suffix from previewablePath", () => {
    expect(isReportPath("reports/report.mdx?start=5&end=5")).toBe(true)
  })

  test("rejects non-report paths", () => {
    expect(isReportPath("src/app.ts")).toBe(false)
    expect(isReportPath("docs/reports/notes.md")).toBe(false) // not at root
    expect(isReportPath("reports/report.md")).toBe(false) // viewer needs .mdx
    expect(isReportPath("reports/")).toBe(false)
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
    expect(reportLinkDate("./reports/report.mdx")).toBe("")
    expect(reportLinkDate("")).toBe("")
  })
})
