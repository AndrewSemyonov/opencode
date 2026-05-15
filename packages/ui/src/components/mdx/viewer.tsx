import { createMemo, type JSX, Show } from "solid-js"
import { parseMdx } from "./parse"
import { createRenderContext, renderNode } from "./render"

export interface MdxViewerProps {
  text: string
  path?: string
  class?: string
  onWarn?: (msg: string) => void
}

export function MdxViewer(props: MdxViewerProps): JSX.Element {
  const tree = createMemo(() => {
    if (!props.text) return null
    try {
      return parseMdx(props.text)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { type: "error", message }
    }
  })

  const ctx = createRenderContext(props.onWarn)

  return (
    <div
      data-component="markdown"
      data-mdx-viewer="true"
      class={props.class}
      style={{
        padding: "24px 28px 80px",
        "max-width": "min(960px, 100%)",
        margin: "0 auto",
      }}
    >
      <Show
        when={tree() && (tree() as any).type !== "error"}
        fallback={
          <Show when={tree()}>
            <div style={{ padding: "16px", color: "var(--text-negative, #b91c1c)" }}>
              Failed to parse MDX: {(tree() as any).message}
            </div>
          </Show>
        }
      >
        {renderNode(tree() as any, ctx)}
      </Show>
    </div>
  )
}
