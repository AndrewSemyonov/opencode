import { Parser } from "acorn"

type MdxJsxAttribute = {
  type: "mdxJsxAttribute"
  name: string
  value: string | null | { type: "mdxJsxAttributeValueExpression"; value: string }
}

type MdxJsxExpressionAttribute = {
  type: "mdxJsxExpressionAttribute"
  value: string
}

export type MdxAttribute = MdxJsxAttribute | MdxJsxExpressionAttribute

type LiteralNode = {
  type: string
  value?: unknown
  raw?: string
  elements?: LiteralNode[]
  properties?: Array<{
    type: string
    key: { type: string; name?: string; value?: unknown }
    value: LiteralNode
    computed: boolean
    shorthand: boolean
  }>
  expression?: LiteralNode
  body?: Array<{ type: string; expression?: LiteralNode }>
  operator?: string
  argument?: LiteralNode
}

function evalLiteral(node: LiteralNode | undefined): { ok: true; value: unknown } | { ok: false } {
  if (!node) return { ok: false }
  switch (node.type) {
    case "Literal":
      return { ok: true, value: node.value }
    case "Identifier":
      if ((node as any).name === "undefined") return { ok: true, value: undefined }
      return { ok: false }
    case "UnaryExpression": {
      if (node.operator !== "-" && node.operator !== "+" && node.operator !== "!") return { ok: false }
      const inner = evalLiteral(node.argument)
      if (!inner.ok) return { ok: false }
      if (node.operator === "-") return { ok: true, value: -Number(inner.value) }
      if (node.operator === "+") return { ok: true, value: +Number(inner.value) }
      return { ok: true, value: !inner.value }
    }
    case "ArrayExpression": {
      const out: unknown[] = []
      for (const el of node.elements ?? []) {
        const v = evalLiteral(el)
        if (!v.ok) return { ok: false }
        out.push(v.value)
      }
      return { ok: true, value: out }
    }
    case "ObjectExpression": {
      const out: Record<string, unknown> = {}
      for (const prop of node.properties ?? []) {
        if (prop.type !== "Property" || prop.computed) return { ok: false }
        let key: string
        if (prop.key.type === "Identifier" && typeof prop.key.name === "string") key = prop.key.name
        else if (prop.key.type === "Literal" && (typeof prop.key.value === "string" || typeof prop.key.value === "number"))
          key = String(prop.key.value)
        else return { ok: false }
        const v = evalLiteral(prop.value)
        if (!v.ok) return { ok: false }
        out[key] = v.value
      }
      return { ok: true, value: out }
    }
    case "TemplateLiteral": {
      const quasis = (node as any).quasis as Array<{ value: { cooked?: string } }> | undefined
      const exprs = (node as any).expressions as LiteralNode[] | undefined
      if (!quasis) return { ok: false }
      if (exprs && exprs.length > 0) return { ok: false }
      return { ok: true, value: quasis.map((q) => q.value.cooked ?? "").join("") }
    }
  }
  return { ok: false }
}

function parseExpression(source: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  // Wrap in parens so a bare `{ ... }` is parsed as an object expression rather than a block.
  const wrapped = `(${source}\n)`
  try {
    const node = Parser.parseExpressionAt(wrapped, 0, { ecmaVersion: 2024 }) as unknown as LiteralNode
    const result = evalLiteral(node)
    if (!result.ok) return { ok: false, reason: "Non-literal expression" }
    return { ok: true, value: result.value }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
}

export function attributesToProps(attrs: readonly MdxAttribute[], onWarn?: (msg: string) => void): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const attr of attrs) {
    if (attr.type === "mdxJsxExpressionAttribute") {
      onWarn?.("Spread attributes are not supported in MDX viewer; ignored.")
      continue
    }
    const name = attr.name
    if (!name) continue
    if (attr.value === null || attr.value === undefined) {
      props[name] = true
      continue
    }
    if (typeof attr.value === "string") {
      props[name] = attr.value
      continue
    }
    if (typeof attr.value === "object" && attr.value.type === "mdxJsxAttributeValueExpression") {
      const result = parseExpression(attr.value.value)
      if (!result.ok) {
        onWarn?.(`Attribute "${name}" expression rejected: ${result.reason}. Only JS literals are allowed.`)
        continue
      }
      props[name] = result.value
    }
  }
  return props
}

export function evaluateExpressionNode(source: string): unknown {
  const result = parseExpression(source)
  if (!result.ok) return undefined
  return result.value
}
