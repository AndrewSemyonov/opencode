import { createContext, useContext, type ParentProps, type ValidComponent } from "solid-js"
import { createSimpleContext } from "./helper"

const ctx = createSimpleContext<ValidComponent, { component: ValidComponent }>({
  name: "FileComponent",
  init: (props) => props.component,
})

export const FileComponentProvider = ctx.provider
export const useFileComponent = ctx.use

export type OpenLocalFile = (path: string) => void

const noop: OpenLocalFile = () => {}
const openLocalFileCtx = createContext<OpenLocalFile>(noop)

export function OpenLocalFileProvider(props: ParentProps<{ value: OpenLocalFile }>) {
  return <openLocalFileCtx.Provider value={props.value}>{props.children}</openLocalFileCtx.Provider>
}

export function useOpenLocalFile(): OpenLocalFile {
  return useContext(openLocalFileCtx)
}

// Opening a report should render the MDX viewer, not a raw file tab. The app
// wires this to requestOpenFile({ kind: "report", ... }); markdown falls back
// to openLocalFile when no provider is present (e.g. outside a session).
export type OpenReport = (path: string) => void

const openReportCtx = createContext<OpenReport | undefined>(undefined)

export function OpenReportProvider(props: ParentProps<{ value: OpenReport }>) {
  return <openReportCtx.Provider value={props.value}>{props.children}</openReportCtx.Provider>
}

export function useOpenReport(): OpenReport | undefined {
  return useContext(openReportCtx)
}
