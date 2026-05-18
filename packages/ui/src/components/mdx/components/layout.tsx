import { Show, type JSX } from "solid-js"

export interface GridProps {
  cols?: number | string
  gap?: number | string
  children?: JSX.Element
}

export function Grid(props: GridProps) {
  const cols = () => {
    const v = props.cols
    if (typeof v === "number") return `repeat(${Math.max(1, Math.min(12, Math.floor(v)))}, minmax(0, 1fr))`
    if (typeof v === "string") return v
    return "repeat(2, minmax(0, 1fr))"
  }
  return (
    <div
      data-component="mdx-grid"
      style={{
        display: "grid",
        "grid-template-columns": cols(),
        gap: typeof props.gap === "number" ? `${props.gap}px` : (props.gap ?? "12px"),
        margin: "12px 0",
      }}
    >
      {props.children}
    </div>
  )
}

export interface MdxCardProps {
  title?: string
  subtitle?: string
  children?: JSX.Element
}

export function MdxCard(props: MdxCardProps) {
  return (
    <div
      data-component="mdx-card"
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "8px",
        padding: "14px 16px",
        "border-radius": "var(--radius-lg, 8px)",
        border: "1px solid var(--border-weak, rgba(0,0,0,0.08))",
        background: "var(--background-base, transparent)",
      }}
    >
      <Show when={props.title}>
        <div>
          <div style={{ "font-weight": 600, color: "var(--text-strong)" }}>{props.title}</div>
          <Show when={props.subtitle}>
            <div style={{ "font-size": "12px", color: "var(--text-weak)" }}>{props.subtitle}</div>
          </Show>
        </div>
      </Show>
      <div>{props.children}</div>
    </div>
  )
}
