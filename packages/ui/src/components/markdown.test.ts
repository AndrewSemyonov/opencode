import { describe, expect, test } from "bun:test"
import { previewablePath } from "./markdown"

describe("previewablePath", () => {
  test("keeps report file links previewable", () => {
    expect(previewablePath("reports/report-2026-05-19.mdx")).toBe("reports/report-2026-05-19.mdx")
  })

  test("supports report links with line suffix", () => {
    expect(previewablePath("reports/report.mdx:12")).toBe("reports/report.mdx?start=12&end=12")
  })

  test("supports leading ./ on report paths", () => {
    expect(previewablePath("./reports/report.mdx")).toBe("./reports/report.mdx")
  })

  test("supports absolute paths into a reports dir", () => {
    expect(previewablePath("/repo/reports/report.mdx:7")).toBe("/repo/reports/report.mdx?start=7&end=7")
  })

  test("blocks non-report file links", () => {
    expect(previewablePath("src/app.ts")).toBeUndefined()
    expect(previewablePath("/repo/src/app.ts:12")).toBeUndefined()
    expect(previewablePath("docker-compose.yml")).toBeUndefined()
    expect(previewablePath("Dockerfile")).toBeUndefined()
    expect(previewablePath("packages/app/.gitignore:5")).toBeUndefined()
    expect(previewablePath("LICENSE")).toBeUndefined()
  })

  test("blocks a bare reports directory token", () => {
    expect(previewablePath("reports/")).toBeUndefined()
  })

  test("ignores web urls", () => {
    expect(previewablePath("https://example.com/reports/app.mdx")).toBeUndefined()
  })
})
