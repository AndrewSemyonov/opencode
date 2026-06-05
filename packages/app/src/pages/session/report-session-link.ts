import type { Command, Message, Part } from "@opencode-ai/sdk/v2/client"

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/
const SESSION_ID_LINE_RE = /^\s*sessionId\s*:\s*(.+?)\s*$/im
const REPORT_SKILL_RE = /report|отч[еёЕЁ]т/i

export type ReportSkillCommand = Pick<Command, "name" | "title" | "description" | "aliases" | "source" | "template">

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

export const isReportSkill = (cmd: { name: string; title?: string | null; aliases?: string[] | null }): boolean => {
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
      source: cmd.source,
      template: cmd.template ?? "",
    }))
    .toSorted((a, b) => (a.title ?? a.name).localeCompare(b.title ?? b.name))
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
