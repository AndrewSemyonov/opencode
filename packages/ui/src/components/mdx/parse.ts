import remarkGfm from "remark-gfm"
import remarkMdx from "remark-mdx"
import remarkParse from "remark-parse"
import { unified, type Processor } from "unified"
import type { Root } from "mdast"

let processor: Processor<Root> | undefined

function getProcessor(): Processor<Root> {
  if (!processor) {
    processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkGfm) as unknown as Processor<Root>
  }
  return processor
}

export function parseMdx(source: string): Root {
  return getProcessor().parse(source)
}
