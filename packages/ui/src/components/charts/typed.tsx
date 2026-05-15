import { type ChartData, type ChartOptions, type Plugin } from "chart.js"
import { createMemo } from "solid-js"
import { Chart } from "./chart"

interface TypedChartProps<TType extends keyof import("chart.js").ChartTypeRegistry> {
  data: ChartData<TType>
  options?: ChartOptions<TType>
  plugins?: Plugin[]
  width?: number
  height?: number
  class?: string
}

export function LineChart(props: TypedChartProps<"line">) {
  return <Chart type="line" {...(props as any)} />
}

export function AreaChart(props: TypedChartProps<"line">) {
  const data = createMemo<ChartData<"line">>(() => {
    const src = (props.data ?? { datasets: [] }) as ChartData<"line">
    return {
      ...src,
      datasets: (src.datasets ?? []).map((ds) => ({ fill: true, tension: 0.35, ...ds })),
    }
  })
  return <Chart type="line" {...(props as any)} data={data() as any} />
}

export function BarChart(props: TypedChartProps<"bar">) {
  return <Chart type="bar" {...(props as any)} />
}

export function StackedBarChart(props: TypedChartProps<"bar">) {
  const defaults: ChartOptions<"bar"> = {
    scales: {
      x: { stacked: true },
      y: { stacked: true },
    },
  }
  return <Chart type="bar" {...(props as any)} defaults={defaults as any} />
}

export function PieChart(props: TypedChartProps<"pie">) {
  return <Chart type="pie" {...(props as any)} />
}

export function DonutChart(props: TypedChartProps<"doughnut">) {
  const defaults: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "60%",
  }
  return <Chart type="doughnut" {...(props as any)} defaults={defaults as any} />
}

export function RadarChart(props: TypedChartProps<"radar">) {
  return <Chart type="radar" {...(props as any)} />
}

export function ScatterChart(props: TypedChartProps<"scatter">) {
  return <Chart type="scatter" {...(props as any)} />
}

export function BubbleChart(props: TypedChartProps<"bubble">) {
  return <Chart type="bubble" {...(props as any)} />
}

export function PolarAreaChart(props: TypedChartProps<"polarArea">) {
  return <Chart type="polarArea" {...(props as any)} />
}

interface GaugeChartProps {
  value: number
  min?: number
  max?: number
  label?: string
  height?: number
  class?: string
}

export function GaugeChart(props: GaugeChartProps) {
  const min = () => props.min ?? 0
  const max = () => props.max ?? 100
  const value = () => Math.max(min(), Math.min(max(), props.value))
  const filled = () => value() - min()
  const empty = () => max() - value()

  const data: ChartData<"doughnut"> = {
    labels: [props.label ?? "value", "remaining"],
    datasets: [
      {
        data: [filled(), empty()] as any,
        circumference: 180,
        rotation: 270,
        borderWidth: 0,
      } as any,
    ],
  }

  const defaults: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
  }

  return (
    <div data-component="gauge-chart" class={props.class} style={{ position: "relative", height: `${props.height ?? 200}px` }}>
      <Chart type="doughnut" data={data as any} defaults={defaults as any} height={props.height ?? 200} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          "justify-content": "flex-end",
          "padding-bottom": "8%",
          "pointer-events": "none",
        }}
      >
        <div style={{ "font-size": "28px", "font-weight": 600, color: "var(--text-strong)" }}>{value()}</div>
        {props.label ? <div style={{ "font-size": "12px", color: "var(--text-weak)" }}>{props.label}</div> : null}
      </div>
    </div>
  )
}
