import { type Component, For, type JSX, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import { attributesToProps, evaluateExpressionNode, type MdxAttribute } from "./props"
import { lookupMdxComponent } from "./whitelist"

type Node = { type: string } & Record<string, any>

interface RenderContext {
  onWarn: (msg: string) => void
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => {
      const code = parseInt(h, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ""
    })
    .replace(/&#(\d+);?/g, (_, d) => {
      const code = parseInt(d, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ""
    })
}

function sanitizeUrl(url: string | undefined | null, ctx: RenderContext): string | undefined {
  if (!url) return undefined
  // Browsers decode HTML entities and ignore control characters when resolving
  // href/src, so we must apply the same normalization *before* matching the
  // scheme — otherwise `java&#x0A;script:` slips through and runs as JS.
  const normalized = decodeHtmlEntities(String(url))
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)
  if (!schemeMatch) return normalized
  const scheme = schemeMatch[1].toLowerCase()
  if (scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel") {
    return normalized
  }
  if (scheme === "data" && /^data:image\//i.test(normalized)) {
    return normalized
  }
  ctx.onWarn(`Blocked URL with scheme "${scheme}": ${normalized.slice(0, 60)}…`)
  return undefined
}

function renderChildren(children: Node[] | undefined, ctx: RenderContext): JSX.Element {
  if (!children) return null
  return <For each={children}>{(child) => renderNode(child, ctx)}</For>
}

function UnknownComponent(props: { name: string }) {
  return (
    <span
      data-component="mdx-unknown"
      style={{
        display: "inline-block",
        padding: "2px 6px",
        "border-radius": "4px",
        background: "var(--background-warning, rgba(245,158,11,0.15))",
        color: "var(--text-warning, #b45309)",
        "font-family": "var(--font-family-mono, monospace)",
        "font-size": "12px",
      }}
      title={`Unknown component <${props.name}>`}
    >
      &lt;{props.name}&gt;
    </span>
  )
}

function renderJsxElement(node: Node, ctx: RenderContext, inline: boolean): JSX.Element {
  const name: string | null = node.name
  if (!name) {
    // Fragment (<>...</>)
    return renderChildren(node.children, ctx)
  }
  const component = lookupMdxComponent(name)
  if (!component) {
    ctx.onWarn(`Unknown component "<${name}>" is not registered in the MDX whitelist.`)
    return <UnknownComponent name={name} />
  }
  const attrs = (node.attributes as MdxAttribute[]) ?? []
  const props = attributesToProps(attrs, ctx.onWarn)
  const hasChildren = Array.isArray(node.children) && node.children.length > 0
  if (hasChildren) (props as any).children = renderChildren(node.children, ctx)
  // mark for layout if needed
  void inline
  return <Dynamic component={component as Component<any>} {...props} />
}

function renderListItem(node: Node, ctx: RenderContext): JSX.Element {
  const checked = node.checked
  if (typeof checked === "boolean") {
    return (
      <li style={{ "list-style": "none", "margin-left": "-1.5em" }}>
        <input type="checkbox" checked={checked} disabled style={{ "margin-right": "8px" }} />
        {renderChildren(node.children, ctx)}
      </li>
    )
  }
  return <li>{renderChildren(node.children, ctx)}</li>
}

function renderTable(node: Node, ctx: RenderContext): JSX.Element {
  const align: Array<"left" | "right" | "center" | null> = node.align ?? []
  const rows = (node.children ?? []) as Node[]
  const [head, ...body] = rows
  return (
    <table data-component="mdx-table">
      <Show when={head}>
        <thead>
          <tr>
            <For each={head!.children as Node[]}>
              {(cell, i) => (
                <th style={{ "text-align": align[i()] ?? "left" }}>{renderChildren(cell.children, ctx)}</th>
              )}
            </For>
          </tr>
        </thead>
      </Show>
      <tbody>
        <For each={body}>
          {(row) => (
            <tr>
              <For each={row.children as Node[]}>
                {(cell, i) => (
                  <td style={{ "text-align": align[i()] ?? "left" }}>{renderChildren(cell.children, ctx)}</td>
                )}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}

function renderCodeBlock(node: Node): JSX.Element {
  const lang = node.lang ? String(node.lang) : undefined
  return (
    <pre data-component="mdx-code">
      <code class={lang ? `language-${lang}` : undefined}>{node.value ?? ""}</code>
    </pre>
  )
}

function renderInlineExpression(node: Node, ctx: RenderContext): JSX.Element {
  const value = evaluateExpressionNode(String(node.value ?? ""))
  if (value === undefined) {
    ctx.onWarn(`Inline expression rejected: ${String(node.value)}`)
    return <code data-component="mdx-rejected-expr">{`{${node.value}}`}</code>
  }
  return <>{String(value)}</>
}

export function renderNode(node: Node | null | undefined, ctx: RenderContext): JSX.Element {
  if (!node) return null

  switch (node.type) {
    case "root":
      return renderChildren(node.children, ctx)

    case "text":
      return <>{node.value}</>

    case "paragraph":
      return <p>{renderChildren(node.children, ctx)}</p>

    case "heading": {
      const tag = `h${Math.min(6, Math.max(1, node.depth ?? 1))}`
      return <Dynamic component={tag}>{renderChildren(node.children, ctx)}</Dynamic>
    }

    case "thematicBreak":
      return <hr />

    case "blockquote":
      return <blockquote>{renderChildren(node.children, ctx)}</blockquote>

    case "list": {
      const tag = node.ordered ? "ol" : "ul"
      const start = node.ordered && typeof node.start === "number" && node.start !== 1 ? { start: node.start } : {}
      return (
        <Dynamic component={tag} {...start}>
          {renderChildren(node.children, ctx)}
        </Dynamic>
      )
    }

    case "listItem":
      return renderListItem(node, ctx)

    case "code":
      return renderCodeBlock(node)

    case "inlineCode":
      return <code>{node.value}</code>

    case "strong":
      return <strong>{renderChildren(node.children, ctx)}</strong>

    case "emphasis":
      return <em>{renderChildren(node.children, ctx)}</em>

    case "delete":
      return <del>{renderChildren(node.children, ctx)}</del>

    case "break":
      return <br />

    case "link": {
      const href = sanitizeUrl(node.url, ctx)
      const external = href && /^https?:/i.test(href)
      return (
        <a
          href={href}
          title={node.title ?? undefined}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          class={external ? "external-link" : undefined}
        >
          {renderChildren(node.children, ctx)}
        </a>
      )
    }

    case "image": {
      const src = sanitizeUrl(node.url, ctx)
      return <img src={src} alt={node.alt ?? ""} title={node.title ?? undefined} />
    }

    case "table":
      return renderTable(node, ctx)

    case "html":
      ctx.onWarn(`Raw HTML is not allowed in MDX viewer; ignored: ${String(node.value).slice(0, 40)}…`)
      return null

    case "yaml":
    case "toml":
    case "mdxjsEsm":
      // strip frontmatter and imports
      return null

    case "mdxFlowExpression":
    case "mdxTextExpression":
      return renderInlineExpression(node, ctx)

    case "mdxJsxFlowElement":
      return renderJsxElement(node, ctx, false)

    case "mdxJsxTextElement":
      return renderJsxElement(node, ctx, true)

    default:
      ctx.onWarn(`Unsupported mdast node "${node.type}"`)
      if (Array.isArray(node.children)) return renderChildren(node.children, ctx)
      return null
  }
}

export function createRenderContext(onWarn?: (msg: string) => void): RenderContext {
  return {
    onWarn:
      onWarn ??
      ((msg) => {
        if (typeof console !== "undefined") console.warn("[MdxViewer]", msg)
      }),
  }
}
