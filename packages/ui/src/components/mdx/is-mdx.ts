import { fileExtension } from "../../pierre/media"

export function isMdxPath(path: string | undefined): boolean {
  return fileExtension(path) === "mdx"
}
