import {
  findReportSkillForFile,
  planReportReconcile,
  resolveReportReconcile,
} from "./report-session-link"

type ReportFile = { type?: string; path?: string }
type ReportSkill = { name: string }

export type ReportSessionMeta = {
  id: string
  parentID?: string
  time?: { archived?: number; created?: number }
}

export type ReportSessionState = {
  empty: boolean
  busy: boolean
  artifactPath?: string
}

export type FetchReportSessionResult =
  | { status: "found"; session: ReportSessionMeta }
  | { status: "gone" }
  | { status: "unknown" }

export type CurrentReportArtifact = "current" | "stale" | "unknown"

export async function runReportSessionBackfill(input: {
  files: ReportFile[] | undefined
  skills: ReportSkill[]
  sessions: ReportSessionMeta[]
  marked: ReadonlySet<string>
  now: number
  minAge: number
  reconcile: boolean
  isCurrent: () => boolean
  readReportOwner: (path: string) => Promise<string | undefined>
  mark: (sessionID: string, skillName: string) => void
  unmark: (sessionID: string) => void
  fetchSession: (sessionID: string) => Promise<FetchReportSessionResult>
  readState: (sessionID: string) => Promise<ReportSessionState>
  checkArtifact: (sessionID: string, path: string) => Promise<CurrentReportArtifact>
  deleteSession: (sessionID: string) => Promise<boolean>
}): Promise<boolean> {
  const withFile = new Set<string>()
  let ambiguous = false

  await Promise.all(
    (input.files ?? []).map(async (file) => {
      if (!file.path || file.type === "directory" || !/\.mdx?$/i.test(file.path)) return
      const sessionID = await input.readReportOwner(file.path)
      if (!input.isCurrent()) return
      if (!sessionID) {
        ambiguous = true
        return
      }
      withFile.add(sessionID)
      const skill = findReportSkillForFile(input.skills, file.path)
      if (skill) input.mark(sessionID, skill.name)
    }),
  )
  if (!input.isCurrent()) return false
  if (!input.reconcile) return true

  const roots = new Map(input.sessions.filter((session) => !session.parentID).map((session) => [session.id, session]))
  const parents = new Set(input.sessions.filter((session) => session.parentID).map((session) => session.parentID!))

  for (const sessionID of new Set([...input.marked, ...roots.keys()])) {
    let meta = roots.get(sessionID)
    if (!meta) {
      const fetched = await input.fetchSession(sessionID)
      if (!input.isCurrent()) return false
      if (fetched.status === "gone") {
        input.unmark(sessionID)
        continue
      }
      if (fetched.status === "unknown") continue
      meta = fetched.session
    }

    const plan = planReportReconcile({
      hasFile: withFile.has(sessionID),
      meta: { archived: !!meta.time?.archived, created: meta.time?.created ?? 0 },
      hasChildren: parents.has(sessionID),
      marked: input.marked.has(sessionID),
      now: input.now,
      minAge: input.minAge,
    })
    if (plan.action === "keep" || plan.action === "skip" || plan.action === "probeStale") continue
    if (!plan.marked) continue

    const state = await input.readState(sessionID)
    if (!input.isCurrent()) return false
    if (state.busy) continue

    let artifact = false
    let uncertainArtifact = ambiguous
    if (state.artifactPath) {
      const status = await input.checkArtifact(sessionID, state.artifactPath)
      if (!input.isCurrent()) return false
      artifact = status === "current"
      uncertainArtifact ||= status === "unknown"
    }

    const outcome = resolveReportReconcile(plan, {
      empty: state.empty,
      artifact,
      ambiguous: uncertainArtifact,
    })
    if (outcome === "delete") {
      const deleted = await input.deleteSession(sessionID)
      if (!input.isCurrent()) return false
      if (deleted) input.unmark(sessionID)
      continue
    }
    if (outcome === "unmark") input.unmark(sessionID)
  }

  return input.isCurrent()
}
