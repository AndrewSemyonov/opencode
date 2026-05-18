#!/usr/bin/env bun
// Regenerates packages/ui/src/styles/theme.css from the built-in default theme
// (currently void0). Replaces the theme-token section while preserving the
// non-theme header (fonts, spacing, breakpoints, etc.).
//
// Run from the repo root:
//   bun run scripts/generate-default-theme-css.ts
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { resolveTheme, themeToCss } from "../packages/ui/src/theme/resolve"
import type { DesktopTheme } from "../packages/ui/src/theme/types"
import void0Json from "../packages/ui/src/theme/themes/void0.json" with { type: "json" }

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cssPath = path.join(root, "packages/ui/src/styles/theme.css")

const themeId = "void0"
const theme = void0Json as DesktopTheme
const { light, dark } = resolveTheme(theme)
const lightCss = themeToCss(light)
const darkCss = themeToCss(dark)

const original = readFileSync(cssPath, "utf8")
const headerEnd = original.indexOf("color-scheme: light;")
if (headerEnd < 0) throw new Error("Cannot locate `color-scheme: light;` anchor in theme.css")
const header = original.slice(0, headerEnd)

const block = `color-scheme: light;
  --text-mix-blend-mode: multiply;

  /* ${themeId} fallback variables (light) */
  ${lightCss}

  @media (prefers-color-scheme: dark) {
    color-scheme: dark;
    --text-mix-blend-mode: plus-lighter;

    /* ${themeId} fallback variables (dark) */
    ${darkCss}
  }
}
`

writeFileSync(cssPath, header + block, "utf8")
console.log(`Wrote ${cssPath} (theme=${themeId})`)
