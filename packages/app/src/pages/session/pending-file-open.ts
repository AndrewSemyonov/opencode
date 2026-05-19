import { createSignal } from "solid-js"

export type PendingFileOpen =
  | { kind: "tab"; path: string; sessionId?: string }
  | { kind: "report"; path: string; sessionId?: string }
  | { kind: "file-fullscreen"; path: string }

const [pendingFileOpen, setPendingFileOpen] = createSignal<PendingFileOpen | undefined>(undefined)

export const requestOpenFile = (input: PendingFileOpen | string) => {
  if (typeof input === "string") {
    setPendingFileOpen({ kind: "tab", path: input })
    return
  }
  setPendingFileOpen(input)
}
export const consumePendingFileOpen = (): PendingFileOpen | undefined => {
  const value = pendingFileOpen()
  if (value !== undefined) setPendingFileOpen(undefined)
  return value
}
export const peekPendingFileOpen = pendingFileOpen
