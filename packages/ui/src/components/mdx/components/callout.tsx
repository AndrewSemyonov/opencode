import { Show, type JSX } from "solid-js"

type CalloutType = "info" | "warning" | "success" | "danger"

const palette: Record<CalloutType, { bg: string; border: string; text: string; icon: string }> = {
  info: {
    bg: "var(--background-info, rgba(59, 130, 246, 0.08))",
    border: "var(--border-info, rgba(59, 130, 246, 0.3))",
    text: "var(--text-info, #1d4ed8)",
    icon: "ⓘ",
  },
  warning: {
    bg: "var(--background-warning, rgba(245, 158, 11, 0.10))",
    border: "var(--border-warning, rgba(245, 158, 11, 0.35))",
    text: "var(--text-warning, #b45309)",
    icon: "⚠",
  },
  success: {
    bg: "var(--background-success, rgba(34, 197, 94, 0.08))",
    border: "var(--border-success, rgba(34, 197, 94, 0.3))",
    text: "var(--text-success, #15803d)",
    icon: "✓",
  },
  danger: {
    bg: "var(--background-danger, rgba(239, 68, 68, 0.08))",
    border: "var(--border-danger, rgba(239, 68, 68, 0.3))",
    text: "var(--text-danger, #b91c1c)",
    icon: "✕",
  },
}

export interface CalloutProps {
  type?: CalloutType
  title?: string
  children?: JSX.Element
}

export function Callout(props: CalloutProps) {
  const colors = () => palette[props.type ?? "info"]
  return (
    <div
      data-component="mdx-callout"
      style={{
        display: "flex",
        gap: "12px",
        padding: "12px 14px",
        "border-radius": "var(--radius-md, 6px)",
        "border-left": `3px solid ${colors().border}`,
        background: colors().bg,
        margin: "12px 0",
      }}
    >
      <div style={{ color: colors().text, "font-size": "16px", "line-height": 1.4 }}>{colors().icon}</div>
      <div style={{ flex: 1 }}>
        <Show when={props.title}>
          <div style={{ "font-weight": 600, color: colors().text, "margin-bottom": "4px" }}>{props.title}</div>
        </Show>
        <div style={{ color: "var(--text-strong)" }}>{props.children}</div>
      </div>
    </div>
  )
}
