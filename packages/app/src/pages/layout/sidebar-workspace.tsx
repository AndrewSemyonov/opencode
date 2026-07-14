import { useNavigate, useParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, For, onCleanup, Show, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createSortable } from "@thisbeyond/solid-dnd"
import { createMediaQuery } from "@solid-primitives/media"
import { base64Encode } from "@opencode-ai/shared/util/encode"
import { getFilename } from "@opencode-ai/shared/util/path"
import { Button } from "@opencode-ai/ui/button"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { type Part, type Session } from "@opencode-ai/sdk/v2/client"
import { type LocalProject, useLayout } from "@/context/layout"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { NewSessionItem, SessionItem, SessionSkeleton } from "./sidebar-items"
import { sortedRootSessions, workspaceKey } from "./helpers"
import { moreSessionsAvailable, pageUntilVisibleProgress, SESSION_PAGE_SIZE } from "./session-paging"
import FileTree from "@/components/file-tree"
import { FileProvider } from "@/context/file"
import { SDKProvider, useSDK } from "@/context/sdk"
import { SyncProvider, useSync } from "@/context/sync"
import { requestOpenFile } from "@/pages/session/pending-file-open"
import {
  extractSessionIdFromReport,
  findReportSkillForFile,
  findSessionIdByReportPath,
  hasRealReportArtifact,
  loadWorkspaceReportSkills,
  mergeReportSkills,
  planReportReconcile,
  readReportSessionId,
  reportOpenTarget,
  reportSkillCommands,
  resolveReportReconcile,
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

// Empty sessions younger than this are never deleted by the reconcile, so a
// session that was just created (and may still be receiving its first message)
// can't be mistaken for old left-over junk.
const RECONCILE_MIN_AGE = 60_000

// True only when the server confirms a session is genuinely gone (a 404
// NotFoundError). The SDK is built with throwOnError, so a transient network
// failure rejects the exact same way as a 404 — inspecting the error shape
// (NamedError.toObject() -> { name, data }) is the only way to tell them
// apart. Treating every rejection as "gone" would wrongly drop a real report's
// mark on a flaky connection, re-exposing it in CHATS.
function isSessionGone(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { name?: unknown }).name === "NotFoundError"
}

// Authoritative report state of a session, from its own messages: whether it
// has 0 messages, whether it actually wrote a reports/*.mdx file, and whether a
// turn is still in flight (a report mid-generation). All fall back to the safe
// side on error (non-empty + has-artifact + busy → never delete, never unmark).
async function reportState(
  sdk: ReturnType<typeof useSDK>,
  sessionID: string,
): Promise<{ empty: boolean; artifact: boolean; busy: boolean }> {
  const res = await sdk.client.session.messages({ sessionID, limit: 1000 }).catch(() => undefined)
  const items = (res?.data ?? []).filter((x) => !!x?.info?.id)
  if (!res) return { empty: false, artifact: true, busy: true }
  const parts: Record<string, Part[]> = {}
  for (const item of items) parts[item.info.id] = item.parts ?? []
  // Mid-generation guard: a run is "busy" while its assistant turn is streaming
  // (an assistant message with no `completed`), AND during the brief window
  // right after `/skill` is sent where the user message exists but the assistant
  // row hasn't been committed yet (a non-empty session with NO assistant
  // message). Either way we must not unmark it.
  const busy =
    items.some((x) => x.info.role === "assistant" && x.info.time.completed == null) ||
    (items.length > 0 && !items.some((x) => x.info.role === "assistant"))
  // Only the write-tool part counts here — a report written via bash/python has
  // no such part, but those are matched authoritatively by the reports/ dir
  // scan (withFile) BEFORE this fallback runs. A bare text link is NOT used: it
  // can be present with no real file (a claimed-but-not-written report).
  const artifact = hasRealReportArtifact(parts)
  return { empty: items.length === 0, artifact, busy }
}

// Report-session membership is re-derived from the workspace's committed
// `reports/` directory while the workspace is mounted. That directory is
// git-tracked and survives sandbox recreation, so it is the source of truth for
// "this session produced a report" — no separate cache file is needed (a
// previous `.opencode-data/report-sessions.json` cache never persisted anyway,
// opspace excludes `.opencode-data/` from git/auto-commit).
//
// Invariant enforced here: a session is hidden from the chat list ⟺ it has a
// real report file in `reports/`. Each pass:
//   1. marks every session that HAS a report file (keeps it hidden), and
//   2. once (after the session list is loaded) reconciles everything else:
//        • an empty (0-message) root session → deleted, and
//        • a real chat wrongly tagged as a report but with NO file → unmarked
//          so it returns to the normal chat list.
//
// An empty server session is abandoned junk: a normal new chat only becomes a
// server session on its first message, so nothing the user cares about is ever
// message-less. Empty root sessions that were REPORT-MARKED (left-over "New
// session" chats from the old click-a-report-creates-a-session bug) are deleted;
// an unrelated empty chat is left alone. Archived sessions, sessions that have
// child sessions, and sessions younger than RECONCILE_MIN_AGE are untouched.
//
// The marking pass re-runs whenever the report-skill list changes (commands
// stream in at startup). The destructive reconcile runs once PER MOUNT (guarded
// by `reconciled`), after explicitly loading the session list. Note the
// workspace subtree unmounts/remounts on collapse/expand, so it can run again
// later — deleting a session the user just started is prevented not by timing
// but by the emptiness probe plus the RECONCILE_MIN_AGE age guard (a
// mid-generation report already carries its `/skill` message, so it is never
// empty; a brand-new session is younger than the age guard). Each run bumps
// `token`; stale runs (superseded, or the component unmounting) drop their work
// via the token check.
function createReportSessionBackfill(input: {
  directory: string
  skills: Accessor<ReportSkillCommand[]>
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  globalSync: ReturnType<typeof useGlobalSync>
  layout: ReturnType<typeof useLayout>
}): void {
  let token = 0
  let reconciled = false
  onCleanup(() => {
    token++ // any in-flight pass becomes a no-op
  })
  createEffect(() => {
    const list = input.skills()
    const current = ++token // supersede any in-flight pass
    void (async () => {
      let files: Awaited<ReturnType<typeof input.sdk.client.file.list>>["data"]
      try {
        files = (await input.sdk.client.file.list({ path: "reports" })).data
      } catch {
        return
      }
      if (current !== token) return // a newer pass started, or we unmounted

      // 1) Every session backed by a report file is a real report → mark it.
      // `ambiguous` = a real reports/*.mdx exists that could NOT be mapped to a
      // session (empty/unresolvable frontmatter sessionId — the skills allow
      // this when the session-id tool is unavailable). Such a file might belong
      // to any marked session, so its presence blocks the reconcile from
      // dropping marks (a bash report must not be re-exposed to CHATS).
      const withFile = new Set<string>()
      let ambiguous = false
      await Promise.all(
        (files ?? []).map(async (file) => {
          if (!file.path || file.type === "directory") return
          if (!/\.mdx?$/i.test(file.path)) return
          // Frontmatter ONLY (same authoritative signal as the in-session
          // self-heal) — never text-mention matching, which would pin a file to
          // a session that merely echoed the path and demote the real writer.
          const sid = await readReportSessionId(input.sdk.client.file, file.path)
          if (current !== token) return
          if (!sid) {
            ambiguous = true
            return
          }
          withFile.add(sid)
          const skill = findReportSkillForFile(list, file.path)
          if (skill) input.layout.reportSessions.markReportSession(input.directory, sid, skill.name)
        }),
      )
      if (current !== token) return

      // 2) Reconcile once per mount (set the flag only AFTER a full pass, so a
      // pass superseded mid-await doesn't permanently consume the one-shot).
      if (reconciled) return
      await input.globalSync.project.loadSessions(input.directory).catch(() => {})
      if (current !== token) return

      const sessions = input.globalSync.child(input.directory, { bootstrap: false })[0].session ?? []
      const roots = new Map(sessions.filter((s) => !s.parentID).map((s) => [s.id, s]))
      // Best-effort: the child store holds only roots at mount, so this is
      // usually empty. The real safety net against cascading deletes is the
      // emptiness probe below (a parent with children always has messages).
      const parents = new Set(sessions.filter((s) => s.parentID).map((s) => s.parentID))
      const marked = input.layout.reportSessions.reportSessionIds(input.directory)
      const now = Date.now()
      const unmark = (sid: string) => input.layout.reportSessions.unmarkReportSession(input.directory, sid)
      for (const sid of new Set([...marked, ...roots.keys()])) {
        const meta = roots.get(sid) ?? input.sync.session.get(sid)
        const plan = planReportReconcile({
          hasFile: withFile.has(sid),
          meta: meta ? { archived: !!meta.time?.archived, created: meta.time?.created ?? 0 } : undefined,
          hasChildren: parents.has(sid),
          marked: marked.has(sid),
          now,
          minAge: RECONCILE_MIN_AGE,
        })
        if (plan.action === "keep" || plan.action === "skip") continue
        if (plan.action === "probeStale") {
          // Absent from the (trimmed/paged) client store — drop the mark ONLY on
          // a definitive "gone" from the server (a transient/thrown error keeps
          // it), so a real report paged out of the store is never re-exposed.
          const gone = await input.sdk.client.session
            .get({ sessionID: sid })
            .then(() => false)
            .catch(isSessionGone)
          if (current !== token) return
          if (gone) unmark(sid)
          continue
        }
        // resolveReportReconcile always keeps a non-marked session regardless
        // of its emptiness — skip the wasted probe for it entirely (delete only
        // ever targets a report-marked orphan).
        if (!plan.marked) continue
        // A marked session that no report file resolved to is only unmarked
        // when it has no report artifact of its OWN — fetch its messages
        // (emptiness + artifact + busy).
        const state = await reportState(input.sdk, sid)
        if (current !== token) return
        // A report still generating (busy) has no file yet — leave it in
        // REPORTS, don't reveal it mid-run.
        if (state.busy) continue
        const outcome = resolveReportReconcile(plan, { ...state, ambiguous })
        if (outcome === "delete") {
          const deleted = await input.sdk.client.session
            .delete({ sessionID: sid })
            .then(() => true)
            .catch(() => false)
          // Only drop the mark once the session is actually gone — an unmark
          // after a failed delete would turn hidden report-junk into a visible
          // empty "New session" that no later pass can clean up (delete only
          // targets marked sessions).
          if (deleted) unmark(sid)
        } else if (outcome === "unmark") {
          unmark(sid)
        }
      }
      if (current === token) reconciled = true
    })()
  })
}

// Headless: runs the report-session backfill for a workspace. Mounted whenever
// the workspace is expanded — NOT gated behind the (collapsed-by-default)
// Reports subsection — so report sessions are marked and hidden from the chat
// list even when the user never opens Reports.
const WorkspaceReportSessionsSyncBody = (props: { directory: string }): JSX.Element => {
  const sdk = useSDK()
  const sync = useSync()
  const globalSync = useGlobalSync()
  const layout = useLayout()
  const [workspaceSkills] = createResource(
    () => props.directory,
    () => loadWorkspaceReportSkills(sdk.client.file),
  )
  const skills = createMemo<ReportSkillCommand[]>(() =>
    mergeReportSkills(reportSkillCommands(sync.data.command), workspaceSkills() ?? []),
  )
  createReportSessionBackfill({ directory: props.directory, skills, sdk, sync, globalSync, layout })
  return null
}

const WorkspaceReportSessionsSync = (props: { directory: string }): JSX.Element => {
  const directory = createMemo(() => props.directory)
  return (
    <SDKProvider directory={directory}>
      <SyncProvider>
        <WorkspaceReportSessionsSyncBody directory={props.directory} />
      </SyncProvider>
    </SDKProvider>
  )
}

const WorkspaceReportSkillListBody = (props: { directory: string }): JSX.Element => {
  const sdk = useSDK()
  const sync = useSync()
  const layout = useLayout()
  const navigate = useNavigate()
  const language = useLanguage()
  const slug = createMemo(() => base64Encode(props.directory))
  const [workspaceSkills] = createResource(() => props.directory, () => loadWorkspaceReportSkills(sdk.client.file))
  const skills = createMemo<ReportSkillCommand[]>(() =>
    mergeReportSkills(reportSkillCommands(sync.data.command), workspaceSkills() ?? []),
  )

  // Clicking a report in the sidebar must NOT create a session. If a report
  // file already exists we open its origin session (and the file panel); if it
  // doesn't, we route to the id-less session view with `?report=<skill>`, which
  // shows the Generate button. A real session is created only when the user
  // presses Generate (session.tsx → generateReport). This is what keeps empty
  // "New session" chats from ever appearing after merely browsing Reports.
  // A report session currently marked for this skill (e.g. one mid-generation
  // that hasn't written its file yet). Never creates a session — only finds an
  // existing one — so clicking a report while it is still generating returns to
  // that run instead of opening a fresh Generate view.
  const pendingSession = (skillName: string): string | undefined => {
    for (const id of layout.reportSessions.reportSessionIds(props.directory)) {
      if (layout.reportSessions.reportSkillForSession(props.directory, id) !== skillName) continue
      if (sync.session.get(id)) return id
    }
    return undefined
  }

  const open = async (skill: ReportSkillCommand) => {
    const files = await sdk.client.file
      .list({ path: "reports" })
      .then((r) => r.data)
      .catch(() => undefined)
    const { path, open: showPanel } = reportOpenTarget(files, skill.name)
    const clearPhantomReportTabs = (sessionId: string) => {
      // Users who hit the pre-fix bug still carry a persisted phantom
      // reports/*.mdx tab for this session (sessionTabs in the layout store),
      // and the side panel opens from persisted tabs, not only from
      // requestOpenFile — navigating back would re-open the panel. Drop stale
      // report tabs when there is no generated file to show.
      const tabs = layout.tabs(`${slug()}/${sessionId}`)
      for (const tab of tabs.all()) {
        if (tab.startsWith("file://") && /(?:^|\/)reports\/[^/]+\.mdx?$/i.test(tab.slice(7))) tabs.close(tab)
      }
    }

    if (showPanel) {
      const target = await resolveReportSessionId(sdk, sync, path)
      if (target) {
        layout.reportSessions.markReportSession(props.directory, target, skill.name)
        requestOpenFile({ kind: "report", path, sessionId: target })
        navigate(`/${slug()}/session/${target}`)
        return
      }
      // The file exists but its origin session can't be resolved (e.g. a
      // bash-written report with empty frontmatter sessionId, or the session
      // was deleted). Still show the existing report standalone — the same
      // fallback the file-tree's openFromTree uses — instead of routing to the
      // id-less Generate view, whose primary CTA would regenerate over it.
      navigate(`/${slug()}/file/${encodeURIComponent(path)}`)
      return
    }

    const pending = pendingSession(skill.name)
    if (pending) {
      clearPhantomReportTabs(pending)
      navigate(`/${slug()}/session/${pending}`)
      return
    }
    navigate(`/${slug()}/session?report=${encodeURIComponent(skill.name)}`)
  }

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
  const hasMore = createMemo(() => moreSessionsAvailable(workspaceStore))
  const busy = createMemo(() => props.ctx.isBusy(props.directory))
  const wasBusy = createMemo((prev) => prev || busy(), false)
  const loading = createMemo(() => open() && !booted() && count() === 0 && !wasBusy())
  const touch = createMediaQuery("(hover: none)")
  const showNew = createMemo(() => !loading() && (touch() || count() === 0 || (active() && !params.id)))
  const loadMore = () =>
    pageUntilVisibleProgress({
      visibleCount: count,
      rawCount: () => workspaceStore.session?.length ?? 0,
      hasMore,
      bumpLimit: () => setWorkspaceStore("limit", (limit) => (limit ?? 0) + SESSION_PAGE_SIZE),
      reload: () => globalSync.project.loadSessions(props.directory),
    })

  // When the freshest page is entirely report sessions, the visible list can be
  // empty even though normal chats exist further down. Surface the first real
  // page automatically so the user never faces a misleadingly empty workspace
  // with no obvious way forward. Guarded so it runs at most once per mount.
  let autoSurfaced = false
  createEffect(() => {
    if (autoSurfaced || !booted()) return
    if (count() > 0 || !hasMore()) {
      autoSurfaced = true
      return
    }
    autoSurfaced = true
    void loadMore()
  })

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
          {/* Headless: marks report sessions so they're hidden from the chat
              list, regardless of whether the Reports section is open. */}
          <WorkspaceReportSessionsSync directory={props.directory} />
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
  const hasMore = createMemo(() => moreSessionsAvailable(workspace().store))
  const loadMore = () =>
    pageUntilVisibleProgress({
      visibleCount: count,
      rawCount: () => workspace().store.session?.length ?? 0,
      hasMore,
      bumpLimit: () => workspace().setStore("limit", (limit) => (limit ?? 0) + SESSION_PAGE_SIZE),
      reload: () => globalSync.project.loadSessions(props.project.worktree),
    })

  // See SortableWorkspace — surface the first page of visible sessions when the
  // newest rows are all report sessions, so the workspace never looks empty.
  let autoSurfaced = false
  createEffect(() => {
    if (autoSurfaced || !booted()) return
    if (count() > 0 || !hasMore()) {
      autoSurfaced = true
      return
    }
    autoSurfaced = true
    void loadMore()
  })

  return (
    <div
      ref={(el) => props.ctx.setScrollContainerRef(el, props.mobile)}
      class="flex flex-col [overflow-anchor:none]"
    >
      {/* Headless: mark report sessions so they're hidden from the chat list. */}
      <WorkspaceReportSessionsSync directory={props.project.worktree} />
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
