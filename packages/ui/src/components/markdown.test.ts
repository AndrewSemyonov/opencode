import { describe, expect, test } from "bun:test"
import { previewablePath } from "./markdown"

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
})
