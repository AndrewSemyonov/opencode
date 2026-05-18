import { Show, type JSX } from "solid-js"

export interface KPIProps {
  title?: string
  value: string | number
  delta?: string | number
  deltaKind?: "positive" | "negative" | "neutral"
  unit?: string
  hint?: string
  children?: JSX.Element
}

const deltaColor: Record<NonNullable<KPIProps["deltaKind"]>, string> = {
  positive: "var(--text-positive, #16a34a)",
  negative: "var(--text-negative, #dc2626)",
  neutral: "var(--text-weak, #6b7280)",
}

export function KPI(props: KPIProps) {
  const kind = () => props.deltaKind ?? "neutral"
  const deltaPrefix = () => {
    if (props.deltaKind === "positive") return "▲ "
    if (props.deltaKind === "negative") return "▼ "
    return ""
  }
  return (
    <div
      data-component="mdx-kpi"
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "4px",
        padding: "16px",
        "border-radius": "var(--radius-lg, 8px)",
        border: "1px solid var(--border-weak, rgba(0,0,0,0.08))",
        background: "var(--background-weak, transparent)",
      }}
    >
      <Show when={props.title}>
        <div style={{ "font-size": "12px", color: "var(--text-weak)", "text-transform": "uppercase", "letter-spacing": "0.05em" }}>
          {props.title}
        </div>
      </Show>
      <div style={{ display: "flex", "align-items": "baseline", gap: "6px" }}>
        <div style={{ "font-size": "28px", "font-weight": 600, color: "var(--text-strong)", "line-height": 1.1 }}>
          {props.value}
        </div>
        <Show when={props.unit}>
          <div style={{ "font-size": "14px", color: "var(--text-weak)" }}>{props.unit}</div>
        </Show>
      </div>
      <Show when={props.delta !== undefined && props.delta !== ""}>
        <div style={{ "font-size": "13px", color: deltaColor[kind()] }}>
          {deltaPrefix()}
          {props.delta}
        </div>
      </Show>
      <Show when={props.hint || props.children}>
        <div style={{ "font-size": "12px", color: "var(--text-weak)", "margin-top": "4px" }}>
          {props.hint}
          {props.children}
        </div>
      </Show>
    </div>
  )
}

export function Stat(props: KPIProps) {
  return (
    <div
      data-component="mdx-stat"
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "2px",
      }}
    >
      <Show when={props.title}>
        <div style={{ "font-size": "11px", color: "var(--text-weak)", "text-transform": "uppercase" }}>{props.title}</div>
      </Show>
      <div style={{ "font-size": "18px", "font-weight": 500, color: "var(--text-strong)" }}>
        {props.value}
        <Show when={props.unit}>
          <span style={{ "font-size": "12px", color: "var(--text-weak)", "margin-left": "4px" }}>{props.unit}</span>
        </Show>
      </div>
    </div>
  )
}
