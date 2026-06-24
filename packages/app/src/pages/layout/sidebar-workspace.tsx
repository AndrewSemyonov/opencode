import { useNavigate, useParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, For, onCleanup, Show, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createSortable } from "@thisbeyond/solid-dnd"
import { createMediaQuery } from "@solid-primitives/media"
import { base64Encode } from "@opencode-ai/shared/util/encode"
import { getFilename } from "@opencode-ai/shared/util/path"
import { Binary } from "@opencode-ai/shared/util/binary"
import { Button } from "@opencode-ai/ui/button"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { type Session } from "@opencode-ai/sdk/v2/client"
import { type LocalProject, useLayout } from "@/context/layout"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { NewSessionItem, SessionItem, SessionSkeleton } from "./sidebar-items"
import { sortedRootSessions, workspaceKey } from "./helpers"
import FileTree from "@/components/file-tree"
import { FileProvider } from "@/context/file"
import { SDKProvider, useSDK } from "@/context/sdk"
import { SyncProvider, useSync } from "@/context/sync"
import { requestOpenFile } from "@/pages/session/pending-file-open"
import {
  expectedReportPath,
  extractSessionIdFromReport,
  findLatestReportFileForSkill,
  findReportSkillForFile,
  findSessionIdByReportPath,
  loadWorkspaceReportSkills,
  mergeReportSkills,
  reportSkillCommands,
  type ReportSkillCommand,
} from "@/pages/session/report-session-link"

type InlineEditorComponent = (props: {
  id: string
  value: Accessor<string>
  onSave: (next: string) => void
  class?: string
  displayClass?: string
  editing?: boolean
  stopPropagation?: boolean
  openOnDblClick?: boolean
}) => JSX.Element

export type WorkspaceSidebarContext = {
  currentDir: Accessor<string>
  navList: Accessor<Session[]>
  sidebarExpanded: Accessor<boolean>
  sidebarHovering: Accessor<boolean>
  clearHoverProjectSoon: () => void
  prefetchSession: (session: Session, priority?: "high" | "low") => void
  workspaceName: (directory: string, projectId?: string, branch?: string) => string | undefined
  renameWorkspace: (directory: string, next: string, projectId?: string, branch?: string) => void
  editorOpen: (id: string) => boolean
  openEditor: (id: string, value: string) => void
  closeEditor: () => void
  setEditor: (key: "value", value: string) => void
  InlineEditor: InlineEditorComponent
  isBusy: (directory: string) => boolean
  workspaceExpanded: (directory: string, local: boolean) => boolean
  setWorkspaceExpanded: (directory: string, value: boolean) => void
  workspaceChatsExpanded: (directory: string) => boolean
  setWorkspaceChatsExpanded: (directory: string, value: boolean) => void
  workspaceReportsExpanded: (directory: string) => boolean
  setWorkspaceReportsExpanded: (directory: string, value: boolean) => void
  workspaceFilesExpanded: (directory: string) => boolean
  setWorkspaceFilesExpanded: (directory: string, value: boolean) => void
  showResetWorkspaceDialog: (root: string, directory: string) => void
  showDeleteWorkspaceDialog: (root: string, directory: string) => void
  setScrollContainerRef: (el: HTMLDivElement | undefined, mobile?: boolean) => void
}

export const WorkspaceDragOverlay = (props: {
  sidebarProject: Accessor<LocalProject | undefined>
  activeWorkspace: Accessor<string | undefined>
  workspaceLabel: (directory: string, branch?: string, projectId?: string) => string
}): JSX.Element => {
  const language = useLanguage()
  const label = createMemo(() => {
    const project = props.sidebarProject()
    if (!project) return
    const directory = props.activeWorkspace()
    if (!directory) return

    const kind =
      directory === project.worktree ? language.t("workspace.type.local") : language.t("workspace.type.sandbox")
    const name = props.workspaceLabel(directory, undefined, project.id)
    return `${kind} : ${name}`
  })

  return (
    <Show when={label()}>
      {(value) => <div class="bg-background-base rounded-md px-2 py-1 text-14-medium text-text-strong">{value()}</div>}
    </Show>
  )
}

const WorkspaceHeader = (props: {
  local: Accessor<boolean>
  busy: Accessor<boolean>
  open: Accessor<boolean>
  directory: string
  language: ReturnType<typeof useLanguage>
  branch: Accessor<string | undefined>
  workspaceValue: Accessor<string>
  workspaceEditActive: Accessor<boolean>
  InlineEditor: WorkspaceSidebarContext["InlineEditor"]
  renameWorkspace: WorkspaceSidebarContext["renameWorkspace"]
  setEditor: WorkspaceSidebarContext["setEditor"]
  projectId?: string
}): JSX.Element => (
  <div class="flex items-center gap-1 min-w-0 flex-1">
    <div class="flex items-center justify-center shrink-0 size-6">
      <Show when={props.busy()}>
        <Spinner class="size-[15px]" />
      </Show>
    </div>
    <span class="text-14-medium text-text-base shrink-0">
      {props.local() ? props.language.t("workspace.type.local") : props.language.t("workspace.type.sandbox")} :
    </span>
    <Show
      when={!props.local()}
      fallback={
        <span class="text-14-medium text-text-base min-w-0 truncate">{getFilename(props.directory)}</span>
      }
    >
      <props.InlineEditor
        id={`workspace:${props.directory}`}
        value={props.workspaceValue}
        onSave={(next) => {
          const trimmed = next.trim()
          if (!trimmed) return
          props.renameWorkspace(props.directory, trimmed, props.projectId, props.branch())
          props.setEditor("value", props.workspaceValue())
        }}
        class="text-14-medium text-text-base min-w-0 truncate"
        displayClass="text-14-medium text-text-base min-w-0 truncate"
        editing={props.workspaceEditActive()}
        stopPropagation={false}
        openOnDblClick={false}
      />
    </Show>
    <div class="flex items-center justify-center shrink-0 overflow-hidden w-0 opacity-0 transition-all duration-200 group-hover/workspace:w-3.5 group-hover/workspace:opacity-100 group-focus-within/workspace:w-3.5 group-focus-within/workspace:opacity-100">
      <Icon name={props.open() ? "chevron-down" : "chevron-right"} size="small" class="text-icon-base" />
    </div>
  </div>
)

const WorkspaceActions = (props: {
  directory: string
  local: Accessor<boolean>
  busy: Accessor<boolean>
  menuOpen: Accessor<boolean>
  pendingRename: Accessor<boolean>
  setMenuOpen: (open: boolean) => void
  setPendingRename: (value: boolean) => void
  sidebarHovering: Accessor<boolean>
  touch: Accessor<boolean>
  language: ReturnType<typeof useLanguage>
  workspaceValue: Accessor<string>
  openEditor: WorkspaceSidebarContext["openEditor"]
  showResetWorkspaceDialog: WorkspaceSidebarContext["showResetWorkspaceDialog"]
  showDeleteWorkspaceDialog: WorkspaceSidebarContext["showDeleteWorkspaceDialog"]
  root: string
  clearHoverProjectSoon: WorkspaceSidebarContext["clearHoverProjectSoon"]
  navigateToNewSession: () => void
}): JSX.Element => (
  <div
    class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity"
    classList={{
      "opacity-100 pointer-events-auto": props.menuOpen(),
      "opacity-0 pointer-events-none": !props.menuOpen(),
      "group-hover/workspace:opacity-100 group-hover/workspace:pointer-events-auto": true,
      "group-focus-within/workspace:opacity-100 group-focus-within/workspace:pointer-events-auto": true,
    }}
  >
    <DropdownMenu
      modal={!props.sidebarHovering()}
      open={props.menuOpen()}
      onOpenChange={(open) => props.setMenuOpen(open)}
    >
      <Tooltip value={props.language.t("common.moreOptions")} placement="top">
        <DropdownMenu.Trigger
          as={IconButton}
          icon="dot-grid"
          variant="ghost"
          class="size-6 rounded-md"
          data-action="workspace-menu"
          data-workspace={base64Encode(props.directory)}
          aria-label={props.language.t("common.moreOptions")}
        />
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          onCloseAutoFocus={(event) => {
            if (!props.pendingRename()) return
            event.preventDefault()
            props.setPendingRename(false)
            props.openEditor(`workspace:${props.directory}`, props.workspaceValue())
          }}
        >
          <DropdownMenu.Item
            disabled={props.local()}
            onSelect={() => {
              props.setPendingRename(true)
              props.setMenuOpen(false)
            }}
          >
            <DropdownMenu.ItemLabel>{props.language.t("common.rename")}</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={props.local() || props.busy()}
            onSelect={() => props.showResetWorkspaceDialog(props.root, props.directory)}
          >
            <DropdownMenu.ItemLabel>{props.language.t("common.reset")}</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={props.local() || props.busy()}
            onSelect={() => props.showDeleteWorkspaceDialog(props.root, props.directory)}
          >
            <DropdownMenu.ItemLabel>{props.language.t("common.delete")}</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
    <Show when={!props.touch()}>
      <Tooltip value={props.language.t("command.session.new")} placement="top">
        <IconButton
          icon="new-session"
          variant="ghost"
          class="size-6 rounded-md opacity-0 pointer-events-none group-hover/workspace:opacity-100 group-hover/workspace:pointer-events-auto group-focus-within/workspace:opacity-100 group-focus-within/workspace:pointer-events-auto"
          data-action="workspace-new-session"
          data-workspace={base64Encode(props.directory)}
          aria-label={props.language.t("command.session.new")}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            props.clearHoverProjectSoon()
            props.navigateToNewSession()
          }}
        />
      </Tooltip>
    </Show>
  </div>
)

export const WorkspaceSubsection = (props: {
  label: string
  open: Accessor<boolean>
  onOpenChange: (value: boolean) => void
  children: JSX.Element
}): JSX.Element => (
  <Collapsible variant="ghost" open={props.open()} onOpenChange={props.onOpenChange}>
    <Collapsible.Trigger class="flex items-center gap-1 w-full pt-2 pb-1 px-2 rounded-md hover:bg-surface-raised-base-hover">
      <Icon name={props.open() ? "chevron-down" : "chevron-right"} size="small" />
      <span class="text-12-medium text-text-weak uppercase tracking-wide">{props.label}</span>
    </Collapsible.Trigger>
    <Collapsible.Content>{props.children}</Collapsible.Content>
  </Collapsible>
)

const FILES_ROOT_NAMES = ["reports"] as const
export const WORKSPACE_FILES_VISIBLE = false

async function resolveReportSessionId(
  sdk: ReturnType<typeof useSDK>,
  sync: ReturnType<typeof useSync>,
  filePath: string,
): Promise<string | undefined> {
  let sessionId: string | undefined
  try {
    const res = await sdk.client.file.read({ path: filePath })
    const data = res.data
    const text = data && data.type === "text" ? data.content : undefined
    sessionId = extractSessionIdFromReport(filePath, text)
  } catch {
    sessionId = undefined
  }
  if (!sessionId) {
    sessionId = findSessionIdByReportPath(sync.data.message, sync.data.part, filePath)
  }
  if (!sessionId) return undefined
  if (sync.session.get(sessionId)) return sessionId
  try {
    const probe = await sdk.client.session.get({ sessionID: sessionId })
    if (probe.data) return sessionId
  } catch {
    return undefined
  }
  return undefined
}

// Path inside the workspace where report-session mappings are cached.
// This file survives sandbox port changes and is backed up with the git repo.
const REPORT_SESSIONS_CACHE = ".opencode-data/report-sessions.json"

async function loadReportSessionsCache(
  fileClient: { read: (input: { path: string }) => Promise<{ data?: { type?: string; content?: string } }> },
): Promise<Record<string, string>> {
  try {
    const res = await fileClient.read({ path: REPORT_SESSIONS_CACHE })
    const text = res.data?.type === "text" ? res.data.content : undefined
    if (!text) return {}
    const parsed = JSON.parse(text)
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    // file missing or unreadable — start fresh
  }
  return {}
}

async function saveReportSessionsCache(
  serverHttp: { url: string; username?: string; password?: string },
  data: Record<string, string>,
): Promise<void> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (serverHttp.username && serverHttp.password) {
      headers["Authorization"] = "Basic " + btoa(`${serverHttp.username}:${serverHttp.password}`)
    }
    await fetch(`${serverHttp.url}/file/content`, {
      method: "POST",
      headers,
      body: JSON.stringify({ path: REPORT_SESSIONS_CACHE, content: JSON.stringify(data, null, 2) }),
    })
  } catch {
    // non-fatal — cache write failure doesn't break anything
  }
}

const WorkspaceReportSkillListBody = (props: { directory: string }): JSX.Element => {
  const sdk = useSDK()
  const server = useServer()
  const sync = useSync()
  const globalSync = useGlobalSync()
  const layout = useLayout()
  const navigate = useNavigate()
  const language = useLanguage()
  const slug = createMemo(() => base64Encode(props.directory))
  const [workspaceSkills] = createResource(() => props.directory, () => loadWorkspaceReportSkills(sdk.client.file))
  const skills = createMemo<ReportSkillCommand[]>(() =>
    mergeReportSkills(reportSkillCommands(sync.data.command), workspaceSkills() ?? []),
  )

  // Pre-populate reportSessions from the workspace file cache immediately on
  // mount so sessions are hidden before the async backfill finishes.
  void (async () => {
    const cached = await loadReportSessionsCache(sdk.client.file)
    for (const [sessionId, skillName] of Object.entries(cached)) {
      layout.reportSessions.markReportSession(props.directory, sessionId, skillName)
    }
  })()

  const createReportSession = async (skillName: string): Promise<string | undefined> => {
    const created = await sdk.client.session
      .create()
      .then((x) => x.data ?? undefined)
      .catch(() => undefined)
    if (!created) return undefined
    const [, setStore] = globalSync.child(props.directory)
    setStore("session", (list) => {
      const result = Binary.search(list, created.id, (item) => item.id)
      const next = [...list]
      if (result.found) next[result.index] = created
      else next.splice(result.index, 0, created)
      return next
    })
    layout.reportSessions.markReportSession(props.directory, created.id, skillName)
    layout.handoff.setTabs(base64Encode(props.directory), created.id)
    return created.id
  }

  const existingPendingSession = (skillName: string): string | undefined => {
    for (const id of layout.reportSessions.reportSessionIds(props.directory)) {
      if (layout.reportSessions.reportSkillForSession(props.directory, id) !== skillName) continue
      if (sync.session.get(id)) return id
    }
    return undefined
  }

  const open = async (skill: ReportSkillCommand) => {
    let path: string | undefined
    try {
      const res = await sdk.client.file.list({ path: "reports" })
      path = findLatestReportFileForSkill(res.data, skill.name)
    } catch {
      path = undefined
    }
    if (!path) path = expectedReportPath(skill.name)
    const target = await resolveReportSessionId(sdk, sync, path)
    if (target) {
      layout.reportSessions.markReportSession(props.directory, target, skill.name)
      requestOpenFile({ kind: "report", path, sessionId: target })
      navigate(`/${slug()}/session/${target}`)
      return
    }
    const pending = existingPendingSession(skill.name)
    if (pending) {
      requestOpenFile({ kind: "report", path, sessionId: pending })
      navigate(`/${slug()}/session/${pending}`)
      return
    }
    const created = await createReportSession(skill.name)
    if (!created) return
    requestOpenFile({ kind: "report", path, sessionId: created })
    navigate(`/${slug()}/session/${created}`)
  }

  let backfillInflight = false
  let backfillToken = 0
  onCleanup(() => {
    backfillToken++ // any in-flight pass becomes a no-op
  })
  createEffect(() => {
    const list = skills()
    if (list.length === 0) return
    if (backfillInflight) return // another pass is already running; skip
    backfillInflight = true
    const token = ++backfillToken
    void (async () => {
      try {
        let files: Awaited<ReturnType<typeof sdk.client.file.list>>["data"]
        try {
          files = (await sdk.client.file.list({ path: "reports" })).data
        } catch {
          return
        }
        // If a newer pass started or the component unmounted, drop results.
        if (token !== backfillToken) return
        await Promise.all(
          (files ?? []).map(async (file) => {
            if (!file.path || file.type === "directory") return
            const skill = findReportSkillForFile(list, file.path)
            if (!skill) return
            const sid = await resolveReportSessionId(sdk, sync, file.path)
            if (token !== backfillToken) return
            if (sid) layout.reportSessions.markReportSession(props.directory, sid, skill.name)
          }),
        )
        // Persist the updated mapping to a workspace file so it survives
        // sandbox port changes (each new port = new localStorage origin).
        if (token === backfillToken) {
          const snapshot = Object.fromEntries(
            [...layout.reportSessions.reportSessionIds(props.directory)].map((id) => [
              id,
              layout.reportSessions.reportSkillForSession(props.directory, id) ?? "",
            ]),
          )
          await saveReportSessionsCache(server.current?.http ?? { url: sdk.url }, snapshot)
        }
      } finally {
        backfillInflight = false
      }
    })()
  })

  return (
    <div class="px-2 pb-2 flex flex-col gap-0.5">
      <Show
        when={skills().length > 0}
        fallback={
          <div class="px-2 py-1.5 text-12-regular text-text-weak">
            {language.t("sidebar.reports.empty")}
          </div>
        }
      >
        <For each={skills()}>
          {(skill) => (
            <button
              type="button"
              class="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left hover:bg-surface-raised-base-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-border-strong-base"
              onClick={() => void open(skill)}
            >
              <Icon name="open-file" size="small" class="text-icon-weak shrink-0" />
              <span class="text-13-regular text-text-base truncate">{skill.title ?? skill.name}</span>
            </button>
          )}
        </For>
      </Show>
    </div>
  )
}

export const WorkspaceReportSkillList = (props: { directory: string }): JSX.Element => {
  const directory = createMemo(() => props.directory)
  return (
    <SDKProvider directory={directory}>
      <SyncProvider>
        <WorkspaceReportSkillListBody directory={props.directory} />
      </SyncProvider>
    </SDKProvider>
  )
}

const WorkspaceFileTreeBody = (props: {
  path: string
  rootNames?: readonly string[]
  kind: "file" | "report"
  directory: string
}): JSX.Element => {
  const sdk = useSDK()
  const sync = useSync()
  const layout = useLayout()
  const navigate = useNavigate()
  const slug = createMemo(() => base64Encode(props.directory))
  const [workspaceSkills] = createResource(() => props.directory, () => loadWorkspaceReportSkills(sdk.client.file))
  const reportSkills = createMemo(() =>
    mergeReportSkills(reportSkillCommands(sync.data.command), workspaceSkills() ?? []),
  )

  const skillForReportFile = (filePath: string): string | undefined =>
    findReportSkillForFile(reportSkills(), filePath)?.name

  const openFromTree = async (filePath: string) => {
    if (props.kind === "file") {
      const origin = await resolveReportSessionId(sdk, sync, filePath)
      if (origin) navigate(`/${slug()}/session/${origin}`)
      navigate(`/${slug()}/file/${encodeURIComponent(filePath)}`)
      return
    }
    // kind === "report"
    const target = await resolveReportSessionId(sdk, sync, filePath)
    if (target) {
      const skillName = skillForReportFile(filePath)
      if (skillName) layout.reportSessions.markReportSession(props.directory, target, skillName)
      requestOpenFile({ kind: "report", path: filePath, sessionId: target })
      navigate(`/${slug()}/session/${target}`)
      return
    }
    // No originating session — fall back to opening the file standalone so
    // the side-panel `kind === "report" && !params.id` guard doesn't drop it.
    navigate(`/${slug()}/file/${encodeURIComponent(filePath)}`)
  }

  return (
    <div class="px-2 pb-2 group/filetree">
      <FileTree path={props.path} rootNames={props.rootNames} onFileClick={(node) => void openFromTree(node.path)} />
    </div>
  )
}

export const WorkspaceFileTreeSection = (props: {
  directory: string
  path: string
  rootNames?: readonly string[]
  kind: "file" | "report"
}): JSX.Element => {
  const directory = createMemo(() => props.directory)
  return (
    <SDKProvider directory={directory}>
      <SyncProvider>
        <FileProvider>
          <WorkspaceFileTreeBody
            path={props.path}
            rootNames={props.rootNames}
            kind={props.kind}
            directory={props.directory}
          />
        </FileProvider>
      </SyncProvider>
    </SDKProvider>
  )
}

export { FILES_ROOT_NAMES }

const WorkspaceSessionList = (props: {
  slug: Accessor<string>
  mobile?: boolean
  ctx: WorkspaceSidebarContext
  showNew: Accessor<boolean>
  loading: Accessor<boolean>
  sessions: Accessor<Session[]>
  hasMore: Accessor<boolean>
  loadMore: () => Promise<void>
  language: ReturnType<typeof useLanguage>
}): JSX.Element => (
  <nav class="flex flex-col gap-1">
    <Show when={props.showNew()}>
      <NewSessionItem
        slug={props.slug()}
        mobile={props.mobile}
        sidebarExpanded={props.ctx.sidebarExpanded}
        clearHoverProjectSoon={props.ctx.clearHoverProjectSoon}
      />
    </Show>
    <Show when={props.loading()}>
      <SessionSkeleton />
    </Show>
    <For each={props.sessions()}>
      {(session) => (
        <SessionItem
          session={session}
          list={props.sessions()}
          navList={props.ctx.navList}
          slug={props.slug()}
          mobile={props.mobile}
          showChild
          sidebarExpanded={props.ctx.sidebarExpanded}
          clearHoverProjectSoon={props.ctx.clearHoverProjectSoon}
          prefetchSession={props.ctx.prefetchSession}
        />
      )}
    </For>
    <Show when={props.hasMore()}>
      <div class="relative w-full py-1">
        <Button
          variant="ghost"
          class="flex w-full text-left justify-start text-14-regular text-text-weak pl-2 pr-10"
          size="large"
          onClick={(e: MouseEvent) => {
            props.loadMore()
            ;(e.currentTarget as HTMLButtonElement).blur()
          }}
        >
          {props.language.t("common.loadMore")}
        </Button>
      </div>
    </Show>
  </nav>
)

export const SortableWorkspace = (props: {
  ctx: WorkspaceSidebarContext
  directory: string
  project: LocalProject
  sortNow: Accessor<number>
  mobile?: boolean
}): JSX.Element => {
  const navigate = useNavigate()
  const params = useParams()
  const globalSync = useGlobalSync()
  const language = useLanguage()
  const layout = useLayout()
  const sortable = createSortable(props.directory)
  const [workspaceStore, setWorkspaceStore] = globalSync.child(props.directory, { bootstrap: false })
  const [menu, setMenu] = createStore({
    open: false,
    pendingRename: false,
  })
  const slug = createMemo(() => base64Encode(props.directory))
  const sessions = createMemo(() =>
    sortedRootSessions(workspaceStore, props.sortNow(), layout.reportSessions.reportSessionIds(props.directory)),
  )
  const local = createMemo(() => props.directory === props.project.worktree)
  const active = createMemo(() => workspaceKey(props.ctx.currentDir()) === workspaceKey(props.directory))
  const workspaceValue = createMemo(() => {
    const name = getFilename(props.directory)
    return props.ctx.workspaceName(props.directory, props.project.id) ?? name
  })
  const open = createMemo(() => props.ctx.workspaceExpanded(props.directory, local()))
  const boot = createMemo(() => open() || active())
  const booted = createMemo((prev) => prev || workspaceStore.status === "complete", false)
  const count = createMemo(() => sessions()?.length ?? 0)
  const hasMore = createMemo(() => workspaceStore.hasMore)
  const busy = createMemo(() => props.ctx.isBusy(props.directory))
  const wasBusy = createMemo((prev) => prev || busy(), false)
  const loading = createMemo(() => open() && !booted() && count() === 0 && !wasBusy())
  const touch = createMediaQuery("(hover: none)")
  const showNew = createMemo(() => !loading() && (touch() || count() === 0 || (active() && !params.id)))
  const loadMore = async () => {
    // hasMore reflects raw server rows, but the visible list filters out
    // report sessions. A page can consist entirely of reports → count
    // doesn't grow even though hasMore stays true. Keep paging until either
    // the filtered count advances or the server runs out, with a safety cap
    // so we never page indefinitely.
    // Using 20 instead of 5 so we can push through dense stretches of
    // report-only pages without the user having to click "Load more" repeatedly.
    const MAX_AUTO_PAGES = 20
    const initial = count()
    for (let i = 0; i < MAX_AUTO_PAGES; i++) {
      setWorkspaceStore("limit", (limit) => (limit ?? 0) + 5)
      await globalSync.project.loadSessions(props.directory)
      if (!workspaceStore.hasMore) return
      if (count() > initial) return
    }
  }

  const workspaceEditActive = createMemo(() => props.ctx.editorOpen(`workspace:${props.directory}`))
  const header = () => (
    <WorkspaceHeader
      local={local}
      busy={busy}
      open={open}
      directory={props.directory}
      language={language}
      branch={() => workspaceStore.vcs?.branch}
      workspaceValue={workspaceValue}
      workspaceEditActive={workspaceEditActive}
      InlineEditor={props.ctx.InlineEditor}
      renameWorkspace={props.ctx.renameWorkspace}
      setEditor={props.ctx.setEditor}
      projectId={props.project.id}
    />
  )

  const openWrapper = (value: boolean) => {
    props.ctx.setWorkspaceExpanded(props.directory, value)
    if (value) return
    if (props.ctx.editorOpen(`workspace:${props.directory}`)) props.ctx.closeEditor()
  }

  createEffect(() => {
    if (!boot()) return
    globalSync.child(props.directory, { bootstrap: true })
  })

  return (
    <div
      // @ts-ignore
      use:sortable
      classList={{
        "opacity-30": sortable.isActiveDraggable,
        "opacity-50 pointer-events-none": busy(),
      }}
    >
      <Collapsible variant="ghost" open={open()} class="shrink-0" onOpenChange={openWrapper}>
        <div class="py-1">
          <div
            class="group/workspace relative"
            data-component="workspace-item"
            data-workspace={base64Encode(props.directory)}
          >
            <div class="flex items-center gap-1">
              <Show
                when={workspaceEditActive()}
                fallback={
                  <Collapsible.Trigger
                    class={`flex items-center justify-between w-full pl-2 py-1.5 rounded-md hover:bg-surface-raised-base-hover transition-[padding] duration-200 ${
                      menu.open ? "pr-16" : "pr-2"
                    } group-hover/workspace:pr-16 group-focus-within/workspace:pr-16`}
                    data-action="workspace-toggle"
                    data-workspace={base64Encode(props.directory)}
                  >
                    {header()}
                  </Collapsible.Trigger>
                }
              >
                <div
                  class={`flex items-center justify-between w-full pl-2 py-1.5 rounded-md transition-[padding] duration-200 ${
                    menu.open ? "pr-16" : "pr-2"
                  } group-hover/workspace:pr-16 group-focus-within/workspace:pr-16`}
                >
                  {header()}
                </div>
              </Show>
              <WorkspaceActions
                directory={props.directory}
                local={local}
                busy={busy}
                menuOpen={() => menu.open}
                pendingRename={() => menu.pendingRename}
                setMenuOpen={(open) => setMenu("open", open)}
                setPendingRename={(value) => setMenu("pendingRename", value)}
                sidebarHovering={props.ctx.sidebarHovering}
                touch={touch}
                language={language}
                workspaceValue={workspaceValue}
                openEditor={props.ctx.openEditor}
                showResetWorkspaceDialog={props.ctx.showResetWorkspaceDialog}
                showDeleteWorkspaceDialog={props.ctx.showDeleteWorkspaceDialog}
                root={props.project.worktree}
                clearHoverProjectSoon={props.ctx.clearHoverProjectSoon}
                navigateToNewSession={() => navigate(`/${slug()}/session`)}
              />
            </div>
          </div>
        </div>

        <Collapsible.Content>
          <WorkspaceSubsection
            label={language.t("sidebar.heading.chats")}
            open={() => props.ctx.workspaceChatsExpanded(props.directory)}
            onOpenChange={(v) => props.ctx.setWorkspaceChatsExpanded(props.directory, v)}
          >
            <WorkspaceSessionList
              slug={slug}
              mobile={props.mobile}
              ctx={props.ctx}
              showNew={showNew}
              loading={loading}
              sessions={sessions}
              hasMore={hasMore}
              loadMore={loadMore}
              language={language}
            />
          </WorkspaceSubsection>
          <WorkspaceSubsection
            label={language.t("sidebar.heading.reports")}
            open={() => props.ctx.workspaceReportsExpanded(props.directory)}
            onOpenChange={(v) => props.ctx.setWorkspaceReportsExpanded(props.directory, v)}
          >
            <WorkspaceReportSkillList directory={props.directory} />
          </WorkspaceSubsection>
          <Show when={WORKSPACE_FILES_VISIBLE}>
            <WorkspaceSubsection
              label={language.t("sidebar.heading.files")}
              open={() => props.ctx.workspaceFilesExpanded(props.directory)}
              onOpenChange={(v) => props.ctx.setWorkspaceFilesExpanded(props.directory, v)}
            >
              <WorkspaceFileTreeSection directory={props.directory} path="" rootNames={FILES_ROOT_NAMES} kind="file" />
            </WorkspaceSubsection>
          </Show>
        </Collapsible.Content>
      </Collapsible>
    </div>
  )
}

export const LocalWorkspace = (props: {
  ctx: WorkspaceSidebarContext
  project: LocalProject
  sortNow: Accessor<number>
  mobile?: boolean
}): JSX.Element => {
  const globalSync = useGlobalSync()
  const language = useLanguage()
  const layout = useLayout()
  const workspace = createMemo(() => {
    const [store, setStore] = globalSync.child(props.project.worktree)
    return { store, setStore }
  })
  const slug = createMemo(() => base64Encode(props.project.worktree))
  const sessions = createMemo(() =>
    sortedRootSessions(
      workspace().store,
      props.sortNow(),
      layout.reportSessions.reportSessionIds(props.project.worktree),
    ),
  )
  const booted = createMemo((prev) => prev || workspace().store.status === "complete", false)
  const count = createMemo(() => sessions()?.length ?? 0)
  const loading = createMemo(() => !booted() && count() === 0)
  const hasMore = createMemo(() => workspace().store.hasMore)
  const loadMore = async () => {
    // See SortableWorkspace.loadMore — keep paging while filtered count
    // stagnates so a stretch of report sessions can't strand the user with
    // an infinitely-clicking "Load more" button.
    const MAX_AUTO_PAGES = 20
    const initial = count()
    for (let i = 0; i < MAX_AUTO_PAGES; i++) {
      workspace().setStore("limit", (limit) => (limit ?? 0) + 5)
      await globalSync.project.loadSessions(props.project.worktree)
      if (!workspace().store.hasMore) return
      if (count() > initial) return
    }
  }

  return (
    <div
      ref={(el) => props.ctx.setScrollContainerRef(el, props.mobile)}
      class="flex flex-col [overflow-anchor:none]"
    >
      <WorkspaceSessionList
        slug={slug}
        mobile={props.mobile}
        ctx={props.ctx}
        showNew={() => false}
        loading={loading}
        sessions={sessions}
        hasMore={hasMore}
        loadMore={loadMore}
        language={language}
      />
    </div>
  )
}
