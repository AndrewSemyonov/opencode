import { Chart, registerables, type ChartOptions } from "chart.js"
import { isServer } from "solid-js/web"

let registered = false

export function ensureChartRegistered() {
  if (registered || isServer) return
  Chart.register(...registerables)
  registered = true
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function readPalette() {
  return {
    text: cssVar("--text-strong", "#1a1a1a"),
    textWeak: cssVar("--text-weak", "#707070"),
    border: cssVar("--border-base", "rgba(0,0,0,0.12)"),
    background: cssVar("--background-base", "#ffffff"),
    series: [
      cssVar("--data-1", "#3b82f6"),
      cssVar("--data-2", "#22c55e"),
      cssVar("--data-3", "#f59e0b"),
      cssVar("--data-4", "#ef4444"),
      cssVar("--data-5", "#a855f7"),
      cssVar("--data-6", "#14b8a6"),
      cssVar("--data-7", "#ec4899"),
      cssVar("--data-8", "#0ea5e9"),
    ],
  }
}

export type Palette = ReturnType<typeof readPalette>

let appliedFor: string | undefined

export function applyChartTheme() {
  if (isServer) return
  ensureChartRegistered()
  const palette = readPalette()
  const key = palette.text + palette.border + palette.background
  if (key === appliedFor) return
  appliedFor = key
  Chart.defaults.color = palette.text
  Chart.defaults.borderColor = palette.border
  Chart.defaults.font.family =
    cssVar("--font-family-sans", "ui-sans-serif, system-ui, sans-serif") || Chart.defaults.font.family
  const plugins = Chart.defaults.plugins as any
  if (plugins?.legend?.labels) plugins.legend.labels.color = palette.text
  if (plugins?.tooltip) {
    plugins.tooltip.titleColor = palette.text
    plugins.tooltip.bodyColor = palette.text
    plugins.tooltip.backgroundColor = palette.background
    plugins.tooltip.borderColor = palette.border
    plugins.tooltip.borderWidth = 1
  }
}

export function watchThemeChanges(onChange: () => void): () => void {
  if (isServer || typeof MutationObserver === "undefined") return () => {}
  const target = document.documentElement
  const observer = new MutationObserver(() => onChange())
  observer.observe(target, { attributes: true, attributeFilter: ["class", "data-theme", "style"] })
  return () => observer.disconnect()
}

export function mergeOptions(base: ChartOptions | undefined, defaults: ChartOptions): ChartOptions {
  if (!base) return defaults
  return {
    ...defaults,
    ...base,
    plugins: { ...(defaults.plugins ?? {}), ...(base.plugins ?? {}) },
    scales: { ...(defaults.scales ?? {}), ...(base.scales ?? {}) },
  } as ChartOptions
}

export function decorateDatasetColors<D extends { datasets?: any[] }>(data: D, palette: Palette): D {
  if (!data?.datasets) return data
  const datasets = data.datasets.map((ds: any, i: number) => {
    const color = palette.series[i % palette.series.length]
    const out: any = { ...ds }
    if (out.borderColor === undefined) out.borderColor = color
    if (out.backgroundColor === undefined) {
      out.backgroundColor = ds.fill ? `${color}33` : color
    }
    if (out.pointBackgroundColor === undefined) out.pointBackgroundColor = color
    return out
  })
  return { ...data, datasets }
}

export function decorateMultiColor<D extends { datasets?: any[] }>(data: D, palette: Palette): D {
  if (!data?.datasets) return data
  const datasets = data.datasets.map((ds: any) => {
    const out: any = { ...ds }
    if (out.backgroundColor === undefined) {
      out.backgroundColor = palette.series.slice(0, ds.data?.length ?? palette.series.length)
    }
    if (out.borderColor === undefined) out.borderColor = palette.background
    return out
  })
  return { ...data, datasets }
}
