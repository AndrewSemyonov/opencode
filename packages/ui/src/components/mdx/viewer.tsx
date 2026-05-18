import { createMemo, ErrorBoundary, type JSX, Show } from "solid-js"
import type { Root } from "mdast"
import { parseMdx } from "./parse"
import { createRenderContext, renderNode } from "./render"

export interface MdxViewerProps {
  text: string
  path?: string
  class?: string
  onWarn?: (msg: string) => void
}

type MdxError = { type: "error"; message: string }
type MdxResult = Root | MdxError | null

function isMdxError(value: MdxResult): value is MdxError {
  return !!value && (value as MdxError).type === "error"
}

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/

function stripFrontmatter(source: string): string {
  return source.replace(FRONTMATTER_RE, "")
}

export function MdxViewer(props: MdxViewerProps): JSX.Element {
  const tree = createMemo<MdxResult>(() => {
    if (!props.text) return null
    try {
      return parseMdx(stripFrontmatter(props.text))
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
      <Show when={tree()}>
        {(t) => (
          <Show
            when={!isMdxError(t())}
            fallback={
              <div style={{ padding: "16px", color: "var(--text-negative, #b91c1c)" }}>
                Failed to parse MDX: {(t() as MdxError).message}
              </div>
            }
          >
            <ErrorBoundary
              fallback={(err) => {
                const message = err instanceof Error ? err.message : String(err)
                props.onWarn?.(`Render failed: ${message}`)
                return (
                  <div style={{ padding: "16px", color: "var(--text-negative, #b91c1c)" }}>
                    Failed to render MDX: {message}
                  </div>
                )
              }}
            >
              {renderNode(t() as Root, ctx)}
            </ErrorBoundary>
          </Show>
        )}
      </Show>
    </div>
  )
}
