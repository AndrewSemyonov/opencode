import type { Command, Message, Part } from "@opencode-ai/sdk/v2/client"

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/
const SESSION_ID_LINE_RE = /^\s*sessionId\s*:\s*(.+?)\s*$/im
const REPORT_SKILL_RE = /report|отч[еёЕЁ]т/i
const REPORT_SKILL_CATEGORY = "report"

export type ReportSkillCommand = Pick<
  Command,
  "name" | "title" | "description" | "aliases" | "category" | "source" | "template"
>

type FileClient = {
  list: (input: { path: string }) => Promise<{ data?: FileListEntry[] }>
  read: (input: { path: string }) => Promise<{ data?: { type?: string; content?: string } }>
}

export const expectedReportPath = (reportName: string): string => `reports/${reportName}.mdx`

type FileListEntry = { type?: string; path?: string; name?: string }

const reportFileRegex = (skillName: string) => {
  const safe = skillName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^${safe}(?:[-_].*)?\\.(?:md|mdx)$`, "i")
}

export const isReportFileForSkill = (path: string, skillName: string): boolean => {
  const slash = path.lastIndexOf("/")
  const name = slash >= 0 ? path.slice(slash + 1) : path
  return reportFileRegex(skillName).test(name)
}

// Prefer the longest skill name on tie — `report-weekly-x.mdx` matches both
// `report` and `report-weekly`; without this preference the alphabetically
// first skill wins and the wrong session gets labelled.
export const findReportSkillForFile = <T extends { name: string }>(
  skills: T[] | null | undefined,
  filePath: string,
): T | undefined => {
  if (!skills || skills.length === 0) return undefined
  let best: T | undefined
  for (const skill of skills) {
    if (!isReportFileForSkill(filePath, skill.name)) continue
    if (!best || skill.name.length > best.name.length) best = skill
  }
  return best
}

export const findLatestReportFileForSkill = (
  files: FileListEntry[] | null | undefined,
  skillName: string,
): string | undefined => {
  if (!files || files.length === 0) return undefined
  const re = reportFileRegex(skillName)
  const matches = files
    .filter((f) => f.type !== "directory" && f.name && re.test(f.name))
    .map((f) => f.path)
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .toSorted()
  return matches.at(-1)
}

// Decides what clicking a report skill should do. The viewer panel opens only
// when a generated report file actually exists; for a not-yet-generated skill
// `open` is false and the sidebar just navigates into the session (the single
// "Generate" CTA lives in the composer). `path` is the existing file, or the
// expected path used to resolve the originating session when none exists.
export const reportOpenTarget = (
  files: FileListEntry[] | null | undefined,
  skillName: string,
): { path: string; open: boolean } => {
  const existing = findLatestReportFileForSkill(files, skillName)
  return { path: existing ?? expectedReportPath(skillName), open: existing !== undefined }
}

export const isReportSkill = (cmd: {
  name: string
  title?: string | null
  aliases?: string[] | null
  category?: string | null
}): boolean => {
  if (cmd.category === REPORT_SKILL_CATEGORY) return true
  const candidates = [cmd.name, cmd.title ?? "", ...(cmd.aliases ?? [])]
  return candidates.some((value) => REPORT_SKILL_RE.test(value))
}

export const reportSkillCommands = (commands: Command[] | undefined | null): ReportSkillCommand[] => {
  if (!commands || commands.length === 0) return []
  return commands
    .filter((cmd) => cmd.source === "skill" && isReportSkill(cmd))
    .map((cmd) => ({
      name: cmd.name,
      title: cmd.title ?? cmd.name,
      description: cmd.description,
      aliases: cmd.aliases ?? [],
      category: cmd.category,
      source: cmd.source,
      template: cmd.template ?? "",
    }))
    .toSorted((a, b) => (a.title ?? a.name).localeCompare(b.title ?? b.name))
}

const sortReportSkills = <T extends { name: string; title?: string | null }>(skills: T[]): T[] =>
  skills.toSorted((a, b) => (a.title ?? a.name).localeCompare(b.title ?? b.name))

const frontmatterBlock = (content: string): string | undefined => content.match(FRONTMATTER_RE)?.[1]

const FRONTMATTER_KEY_RE = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/

const parseFrontmatter = (content: string): Record<string, string | string[]> => {
  const block = frontmatterBlock(content)
  if (!block) return {}
  const lines = block.split(/\r?\n/)
  const out: Record<string, string | string[]> = {}

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(FRONTMATTER_KEY_RE)
    if (!match) continue

    const key = match[1]
    const rest = match[2].trim()
    if (rest) {
      out[key] = unquote(rest)
      continue
    }

    const items: string[] = []
    let j = i + 1
    while (j < lines.length) {
      const line = lines[j]
      if (/^\s*$/.test(line)) {
        j++
        continue
      }
      if (FRONTMATTER_KEY_RE.test(line)) break
      const item = line.match(/^\s*-\s*(.*)$/)
      if (!item) break
      const value = unquote(item[1])
      if (value) items.push(value)
      j++
    }
    if (items.length > 0) out[key] = items
    i = j - 1
  }

  return out
}

const toWorkspaceReportSkill = (path: string, content: string): ReportSkillCommand | undefined => {
  const data = parseFrontmatter(content)
  const name = typeof data.name === "string" ? data.name : path.split("/").at(-2)
  const title = typeof data.title === "string" ? data.title : name
  const description = typeof data.description === "string" ? data.description : ""
  const aliases = Array.isArray(data.aliases) ? data.aliases.filter((value): value is string => !!value) : []
  const category = typeof data.category === "string" ? data.category : undefined

  if (!name || !title) return undefined
  if (!isReportSkill({ name, title, aliases, category })) return undefined

  return {
    name,
    title,
    description,
    aliases,
    category,
    source: "skill",
    template: content.replace(FRONTMATTER_RE, "").trim(),
  }
}

const mergeSkill = (
  current: ReportSkillCommand | undefined,
  incoming: ReportSkillCommand,
): ReportSkillCommand => {
  if (!current) return incoming
  return {
    name: incoming.name || current.name,
    title: incoming.title ?? current.title ?? incoming.name,
    description: incoming.description ?? current.description ?? "",
    aliases: [...new Set([...(current.aliases ?? []), ...(incoming.aliases ?? [])])],
    category: incoming.category ?? current.category,
    source: incoming.source ?? current.source,
    template: incoming.template || current.template || "",
  }
}

export const mergeReportSkills = (
  primary: ReportSkillCommand[] | undefined | null,
  secondary: ReportSkillCommand[] | undefined | null,
): ReportSkillCommand[] => {
  const merged = new Map<string, ReportSkillCommand>()
  for (const skill of secondary ?? []) {
    merged.set(skill.name, mergeSkill(merged.get(skill.name), skill))
  }
  for (const skill of primary ?? []) {
    merged.set(skill.name, mergeSkill(merged.get(skill.name), skill))
  }
  return sortReportSkills([...merged.values()])
}

const SKILL_ROOTS = [".opencode/skill", ".opencode/skills"] as const

export const loadWorkspaceReportSkills = async (fileClient: FileClient): Promise<ReportSkillCommand[]> => {
  const discovered: ReportSkillCommand[] = []

  for (const root of SKILL_ROOTS) {
    let entries: FileListEntry[]
    try {
      entries = (await fileClient.list({ path: root })).data ?? []
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.type !== "directory" || !entry.path) continue
      const skillPath = `${entry.path}/SKILL.md`
      try {
        const res = await fileClient.read({ path: skillPath })
        const data = res.data
        if (!data || data.type !== "text" || !data.content) continue
        const skill = toWorkspaceReportSkill(skillPath, data.content)
        if (skill) discovered.push(skill)
      } catch {
        continue
      }
    }
  }

  return mergeReportSkills([], discovered)
}

export const reportSkillChoices = (
  skills: ReportSkillCommand[] | undefined | null,
  selectedSkillName: string | undefined,
): ReportSkillCommand[] => {
  if (!skills || skills.length === 0) return []
  if (!selectedSkillName) return skills
  const selected = skills.find((skill) => skill.name === selectedSkillName)
  return selected ? [selected] : skills
}

export const strictReportSkillChoice = (
  skills: ReportSkillCommand[] | undefined | null,
  selectedSkillName: string | undefined,
): ReportSkillCommand[] => {
  if (!skills || skills.length === 0 || !selectedSkillName) return []
  const selected = skills.find((skill) => skill.name === selectedSkillName)
  return selected ? [selected] : []
}

export const reportSkillAliases = (commands: Command[] | undefined | null): string[] => {
  const skills = reportSkillCommands(commands)
  const seen = new Set<string>()
  const out: string[] = []
  for (const skill of skills) {
    for (const value of [skill.name, ...(skill.aliases ?? [])]) {
      if (!value) continue
      if (seen.has(value)) continue
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

export const reportSkillAliasesFromSkills = (skills: ReportSkillCommand[] | undefined | null): string[] => {
  if (!skills || skills.length === 0) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const skill of skills) {
    for (const value of [skill.name, ...(skill.aliases ?? [])]) {
      if (!value || seen.has(value)) continue
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

export type ReportSkillSignature = {
  aliases: string[]
  templatePrefixes: string[]
}

const templatePrefix = (template: string): string => {
  const trimmed = template.trim()
  if (!trimmed) return ""
  // first non-empty line up to 80 chars is enough to identify the template uniquely
  const firstLine = trimmed.split(/\r?\n/, 1)[0]
  return firstLine.slice(0, 80)
}

export const reportSkillSignatures = (commands: Command[] | undefined | null): ReportSkillSignature => {
  const skills = reportSkillCommands(commands)
  return reportSkillSignaturesFromSkills(skills)
}

export const reportSkillSignaturesFromSkills = (
  skills: ReportSkillCommand[] | undefined | null,
): ReportSkillSignature => {
  if (!skills || skills.length === 0) return { aliases: [], templatePrefixes: [] }
  const aliasSet = new Set<string>()
  const prefixSet = new Set<string>()
  for (const skill of skills) {
    for (const value of [skill.name, ...(skill.aliases ?? [])]) {
      if (!value) continue
      aliasSet.add(value)
    }
    const prefix = templatePrefix(skill.template ?? "")
    if (prefix) prefixSet.add(prefix)
  }
  return { aliases: [...aliasSet], templatePrefixes: [...prefixSet] }
}

const textPartContent = (parts: Part[] | undefined): string => {
  if (!parts || parts.length === 0) return ""
  let out = ""
  for (const part of parts) {
    if (part.type !== "text") continue
    if (part.synthetic) continue
    if (part.ignored) continue
    out += part.text
  }
  return out
}

const startsWithCommandAlias = (text: string, aliases: string[]): boolean => {
  const trimmed = text.trimStart()
  if (trimmed.length === 0) return false
  if (trimmed[0] !== "/") return false
  for (const alias of aliases) {
    if (!alias) continue
    const prefix = "/" + alias
    if (trimmed.length === prefix.length && trimmed === prefix) return true
    if (trimmed.startsWith(prefix)) {
      const next = trimmed.charAt(prefix.length)
      if (next === " " || next === "\n" || next === "\t" || next === "") return true
    }
  }
  return false
}

const matchesReportInvocation = (
  text: string,
  signature: { aliases: string[]; templatePrefixes?: string[] },
): boolean => {
  if (startsWithCommandAlias(text, signature.aliases)) return true
  const trimmed = text.trimStart()
  if (!trimmed) return false
  for (const prefix of signature.templatePrefixes ?? []) {
    if (!prefix) continue
    if (trimmed.startsWith(prefix)) return true
  }
  return false
}

const toSignature = (input: string[] | { aliases: string[]; templatePrefixes?: string[] }) =>
  Array.isArray(input) ? { aliases: input, templatePrefixes: [] } : input

export const checkReportGenerated = (
  messages: Message[] | undefined,
  parts: Record<string, Part[] | undefined> | undefined,
  signature: string[] | ReportSkillSignature,
): boolean => {
  if (!messages || messages.length === 0) return false
  const sig = toSignature(signature)
  if (sig.aliases.length === 0 && (!sig.templatePrefixes || sig.templatePrefixes.length === 0)) return false
  const partLookup = parts ?? {}

  let pendingReport = false
  for (const message of messages) {
    if (message.role === "user") {
      const text = textPartContent(partLookup[message.id])
      pendingReport = matchesReportInvocation(text, sig)
      continue
    }
    if (message.role === "assistant" && pendingReport) {
      if (typeof message.time.completed === "number") return true
    }
  }
  return false
}

export const hasReportInvocation = (
  messages: Message[] | undefined,
  parts: Record<string, Part[] | undefined> | undefined,
  signature: string[] | ReportSkillSignature,
): boolean => {
  if (!messages || messages.length === 0) return false
  const sig = toSignature(signature)
  if (sig.aliases.length === 0 && (!sig.templatePrefixes || sig.templatePrefixes.length === 0)) return false
  const partLookup = parts ?? {}
  for (const message of messages) {
    if (message.role !== "user") continue
    const text = textPartContent(partLookup[message.id])
    if (matchesReportInvocation(text, sig)) return true
  }
  return false
}

const REPORT_PATH_RE = /(?<![\w-])reports\/[^\s()<>"'\]`*]+\.mdx?\b/i

export const extractReportPathFromText = (text: string): string | undefined => {
  if (!text) return undefined
  const match = text.match(REPORT_PATH_RE)
  if (!match) return undefined
  return match[0].replace(/^\.\//, "")
}

const assistantTextContent = (parts: Part[] | undefined): string => {
  if (!parts) return ""
  let out = ""
  for (const part of parts) {
    if (part.type !== "text") continue
    out += part.text + "\n"
  }
  return out
}

export const findLatestReportPath = (
  messages: Message[] | undefined,
  parts: Record<string, Part[] | undefined> | undefined,
  signature: string[] | ReportSkillSignature,
): string | undefined => {
  if (!messages || messages.length === 0) return undefined
  const sig = toSignature(signature)
  if (sig.aliases.length === 0 && (!sig.templatePrefixes || sig.templatePrefixes.length === 0)) return undefined
  const partLookup = parts ?? {}

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    if (typeof msg.time.completed !== "number") continue
    let userIdx = -1
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === "user") {
        userIdx = j
        break
      }
    }
    if (userIdx < 0) continue
    const userText = textPartContent(partLookup[messages[userIdx].id])
    if (!matchesReportInvocation(userText, sig)) continue
    const responseText = assistantTextContent(partLookup[msg.id])
    return extractReportPathFromText(responseText)
  }
  return undefined
}

export const findLatestReportSkill = <
  T extends { name: string; aliases?: string[] | null; template?: string | null },
>(
  skills: T[] | null | undefined,
  messages: Message[] | undefined,
  parts: Record<string, Part[] | undefined> | undefined,
): T | undefined => {
  if (!skills || skills.length === 0 || !messages || messages.length === 0) return undefined
  const partLookup = parts ?? {}

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    if (typeof msg.time.completed !== "number") continue

    const responseText = assistantTextContent(partLookup[msg.id])
    if (!extractReportPathFromText(responseText)) continue

    let userIdx = -1
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === "user") {
        userIdx = j
        break
      }
    }
    if (userIdx < 0) continue

    const userText = textPartContent(partLookup[messages[userIdx].id])
    const matches = skills.filter((skill) =>
      matchesReportInvocation(userText, {
        aliases: [skill.name, ...(skill.aliases ?? [])],
        templatePrefixes: (() => {
          const prefix = templatePrefix(skill.template ?? "")
          return prefix ? [prefix] : []
        })(),
      }),
    )
    if (matches.length === 0) continue

    return matches.toSorted((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name))[0]
  }

  return undefined
}

export const findSessionIdByReportPath = (
  messageBySession: Record<string, Message[] | undefined> | undefined,
  partByMessage: Record<string, Part[] | undefined> | undefined,
  reportPath: string,
): string | undefined => {
  if (!messageBySession || !reportPath) return undefined
  const target = reportPath.replace(/^\.\//, "")
  const partLookup = partByMessage ?? {}
  let best: string | undefined
  for (const [sessionId, messages] of Object.entries(messageBySession)) {
    if (!messages || messages.length === 0) continue
    for (const msg of messages) {
      if (msg.role !== "assistant") continue
      const text = assistantTextContent(partLookup[msg.id])
      if (extractReportPathFromText(text) === target) {
        if (!best || sessionId > best) best = sessionId
      }
    }
  }
  return best
}

const unquote = (raw: string): string => {
  const trimmed = raw.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

export const extractSessionIdFromReport = (path: string, content: string | undefined | null): string | undefined => {
  if (!content || typeof content !== "string") return undefined
  const lower = path.toLowerCase()

  if (lower.endsWith(".md") || lower.endsWith(".mdx")) {
    const fm = content.match(FRONTMATTER_RE)
    if (!fm) return undefined
    const line = fm[1].match(SESSION_ID_LINE_RE)
    if (!line) return undefined
    const value = unquote(line[1])
    return value || undefined
  }

  if (lower.endsWith(".json")) {
    try {
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === "object" && typeof parsed.sessionId === "string") {
        const value = parsed.sessionId.trim()
        return value || undefined
      }
    } catch {
      return undefined
    }
  }

  return undefined
}
