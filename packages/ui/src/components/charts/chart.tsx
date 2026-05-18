import { type ChartData, type ChartOptions, type ChartTypeRegistry, type Plugin } from "chart.js"
import { DefaultChart } from "solid-chartjs"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { isServer } from "solid-js/web"
import {
  applyChartTheme,
  decorateDatasetColors,
  decorateMultiColor,
  mergeOptions,
  readPalette,
  watchThemeChanges,
} from "./theme"

type ChartType = keyof ChartTypeRegistry

const multiColorTypes = new Set<ChartType>(["pie", "doughnut", "polarArea"])
const noCartesianAxes = new Set<ChartType>(["pie", "doughnut", "polarArea", "radar"])

const baseDefaults: ChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "nearest", intersect: false },
  plugins: {
    legend: { position: "top" as const, labels: { boxWidth: 12, boxHeight: 12, padding: 12 } },
    tooltip: { enabled: true, mode: "nearest", intersect: false },
  },
}

function defaultsFor(type: ChartType): ChartOptions {
  if (type === "radar") {
    return {
      ...baseDefaults,
      scales: {
        r: {
          beginAtZero: true,
          suggestedMin: 0,
          suggestedMax: 10,
          ticks: { backdropColor: "transparent" },
        },
      },
    } as ChartOptions
  }
  if (noCartesianAxes.has(type)) {
    return { ...baseDefaults, scales: {} }
  }
  if (type === "scatter" || type === "bubble") {
    return {
      ...baseDefaults,
      scales: {
        x: { type: "linear", position: "bottom" },
        y: { type: "linear" },
      },
    } as ChartOptions
  }
  return baseDefaults
}

export interface BaseChartProps {
  type: ChartType
  data: ChartData
  options?: ChartOptions
  plugins?: Plugin[]
  width?: number
  height?: number
  defaults?: ChartOptions
  class?: string
}

function hasData(data: ChartData | undefined): boolean {
  if (!data?.datasets) return false
  return data.datasets.some((ds) => Array.isArray(ds?.data) && ds.data.length > 0)
}

function BaseChart(props: BaseChartProps) {
  applyChartTheme()
  const [version, setVersion] = createSignal(0)
  const stop = watchThemeChanges(() => {
    applyChartTheme()
    setVersion((v) => v + 1)
  })
  onCleanup(stop)

  const data = createMemo(() => {
    void version()
    const palette = readPalette()
    const safe = (props.data ?? { datasets: [] }) as ChartData
    if (multiColorTypes.has(props.type)) return decorateMultiColor(safe, palette)
    return decorateDatasetColors(safe, palette)
  })

  const options = createMemo(() => {
    void version()
    const baseForType = defaultsFor(props.type)
    const withTypeOverrides = props.defaults ? mergeOptions(props.defaults, baseForType) : baseForType
    return mergeOptions(props.options, withTypeOverrides)
  })

  return (
    <div
      data-component="chart"
      class={props.class}
      style={{
        position: "relative",
        width: "100%",
        height: props.height ? `${props.height}px` : "320px",
      }}
    >
      <DefaultChart
        type={props.type}
        data={data()}
        options={options()}
        plugins={props.plugins}
        width={props.width}
        height={props.height}
      />
    </div>
  )
}

export function Chart(props: BaseChartProps) {
  return (
    <Show when={!isServer} fallback={null}>
      <Show
        when={hasData(props.data)}
        fallback={
          <div
            data-component="chart-empty"
            style={{
              padding: "12px 16px",
              "border-radius": "var(--radius-md, 6px)",
              border: "1px dashed var(--border-weak, rgba(0,0,0,0.12))",
              color: "var(--text-weak)",
              "font-size": "12px",
              "text-align": "center",
            }}
          >
            No chart data
          </div>
        }
      >
        <BaseChart {...props} />
      </Show>
    </Show>
  )
}
