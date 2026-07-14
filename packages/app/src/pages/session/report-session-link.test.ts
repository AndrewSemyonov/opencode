import { describe, expect, it } from "bun:test"
import type { Command, Message, Part } from "@opencode-ai/sdk/v2/client"
import {
  checkReportGenerated,
  expectedReportPath,
  extractReportPathFromText,
  extractSessionIdFromReport,
  findLatestReportPath,
  findLatestReportSkill,
  findReportArtifactPath,
  findReportSkillForFile,
  findSessionIdByReportPath,
  hasRealReportArtifact,
  hasReportInvocation,
  isReportSkill,
  loadWorkspaceReportSkills,
  mergeReportSkills,
  planReportReconcile,
  readReportSessionId,
  reportOpenTarget,
  reportSkillAliases,
  reportSkillChoices,
  reportSkillCommands,
  resolveReportReconcile,
  strictReportSkillChoice,
} from "./report-session-link"
import { runReportSessionBackfill } from "./report-session-reconcile"

describe("extractSessionIdFromReport", () => {
  it("reads sessionId from md frontmatter", () => {
    const content = "---\ntitle: Weekly\nsessionId: ses_abc123\n---\n# Hello"
    expect(extractSessionIdFromReport("reports/x.md", content)).toBe("ses_abc123")
  })

  it("reads sessionId from mdx frontmatter", () => {
    const content = "---\nsessionId: ses_mdx\n---\n<MDX />"
    expect(extractSessionIdFromReport("reports/x.mdx", content)).toBe("ses_mdx")
  })

  it("supports quoted sessionId", () => {
    const dq = '---\nsessionId: "ses_quoted"\n---'
    const sq = "---\nsessionId: 'ses_sq'\n---"
    expect(extractSessionIdFromReport("a.md", dq)).toBe("ses_quoted")
    expect(extractSessionIdFromReport("a.md", sq)).toBe("ses_sq")
  })

  it("supports CRLF frontmatter", () => {
    const content = "---\r\nsessionId: ses_crlf\r\n---\r\nbody"
    expect(extractSessionIdFromReport("a.md", content)).toBe("ses_crlf")
  })

  it("reads sessionId from json top-level", () => {
    const content = JSON.stringify({ sessionId: "ses_json", other: 1 })
    expect(extractSessionIdFromReport("reports/x.json", content)).toBe("ses_json")
  })

  it("returns undefined when frontmatter is missing", () => {
    expect(extractSessionIdFromReport("a.md", "# no frontmatter here")).toBeUndefined()
  })

  it("returns undefined when sessionId field is missing", () => {
    expect(extractSessionIdFromReport("a.md", "---\ntitle: x\n---\nbody")).toBeUndefined()
  })

  it("returns undefined for malformed json", () => {
    expect(extractSessionIdFromReport("a.json", "{not json")).toBeUndefined()
  })

  it("returns undefined for json without sessionId", () => {
    expect(extractSessionIdFromReport("a.json", JSON.stringify({ other: 1 }))).toBeUndefined()
  })

  it("returns undefined for unsupported extensions", () => {
    expect(extractSessionIdFromReport("a.txt", "---\nsessionId: x\n---")).toBeUndefined()
    expect(extractSessionIdFromReport("a.png", "anything")).toBeUndefined()
  })

  it("returns undefined for null/empty content (binary)", () => {
    expect(extractSessionIdFromReport("a.md", null)).toBeUndefined()
    expect(extractSessionIdFromReport("a.md", undefined)).toBeUndefined()
    expect(extractSessionIdFromReport("a.md", "")).toBeUndefined()
  })

  it("returns undefined when sessionId value is empty", () => {
    expect(extractSessionIdFromReport("a.md", "---\nsessionId:   \n---")).toBeUndefined()
    expect(extractSessionIdFromReport("a.json", JSON.stringify({ sessionId: "" }))).toBeUndefined()
  })
})

const cmd = (input: Partial<Command> & Pick<Command, "name">): Command => ({
  template: "",
  hints: [],
  ...input,
})

describe("isReportSkill", () => {
  it("matches by explicit category", () => {
    expect(isReportSkill({ name: "guests-yesterday-vs-plan", category: "report" })).toBe(true)
  })

  it("matches by name", () => {
    expect(isReportSkill({ name: "report" })).toBe(true)
  })

  it("matches by title in Russian", () => {
    expect(isReportSkill({ name: "x", title: "Отчёт" })).toBe(true)
    expect(isReportSkill({ name: "x", title: "Отчет" })).toBe(true)
  })

  it("matches by alias", () => {
    expect(isReportSkill({ name: "x", aliases: ["отчет"] })).toBe(true)
  })

  it("does not match unrelated names", () => {
    expect(isReportSkill({ name: "help" })).toBe(false)
    expect(isReportSkill({ name: "summary", aliases: ["sum"] })).toBe(false)
  })
})

describe("reportSkillCommands", () => {
  it("filters by source=skill and explicit report category", () => {
    const out = reportSkillCommands([
      cmd({ name: "guests-yesterday-vs-plan", title: "Гости вчера vs план", category: "report", source: "skill" }),
      cmd({ name: "guests-yesterday-vs-plan", title: "Other", category: "report", source: "command" }),
      cmd({ name: "help", source: "skill" }),
    ])
    expect(out.map((s) => s.name)).toEqual(["guests-yesterday-vs-plan"])
  })

  it("keeps regex fallback for older report skills", () => {
    const out = reportSkillCommands([
      cmd({ name: "report", title: "Отчёт", source: "skill" }),
      cmd({ name: "help", source: "skill" }),
    ])
    expect(out.map((s) => s.name)).toEqual(["report"])
  })

  it("sorts by title", () => {
    const out = reportSkillCommands([
      cmd({ name: "zreport", title: "Z report", source: "skill" }),
      cmd({ name: "areport", title: "A report", source: "skill" }),
    ])
    expect(out.map((s) => s.name)).toEqual(["areport", "zreport"])
  })

  it("returns empty array for null/undefined", () => {
    expect(reportSkillCommands(undefined)).toEqual([])
    expect(reportSkillCommands(null)).toEqual([])
    expect(reportSkillCommands([])).toEqual([])
  })
})

describe("mergeReportSkills", () => {
  it("prefers runtime command fields while filling gaps from workspace skills", () => {
    const merged = mergeReportSkills(
      [cmd({ name: "hotel-report", title: "Runtime title", source: "skill", template: "Runtime template" })],
      [
        {
          name: "hotel-report",
          title: "Workspace title",
          description: "Workspace description",
          aliases: ["отчет"],
          category: "report",
          source: "skill",
          template: "",
        },
      ],
    )

    expect(merged).toEqual([
      {
        name: "hotel-report",
        title: "Runtime title",
        description: "Workspace description",
        aliases: ["отчет"],
        category: "report",
        source: "skill",
        template: "Runtime template",
      },
    ])
  })
})

describe("loadWorkspaceReportSkills", () => {
  it("loads report skills from .opencode/skills SKILL.md files", async () => {
    const out = await loadWorkspaceReportSkills({
      async list({ path }) {
        if (path !== ".opencode/skill" && path !== ".opencode/skills") return { data: [] }
        if (path === ".opencode/skill") return { data: [] }
        return {
          data: [
            { type: "directory", path: ".opencode/skills/guests-yesterday-vs-plan", name: "guests-yesterday-vs-plan" },
            { type: "directory", path: ".opencode/skills/help", name: "help" },
          ],
        }
      },
      async read({ path }) {
        if (path === ".opencode/skills/guests-yesterday-vs-plan/SKILL.md") {
          return {
            data: {
              type: "text",
              content: `---
name: guests-yesterday-vs-plan
title: Гости вчера vs план
description: Проверяет гостей за вчера
aliases:
  - гости вчера
category: report
---

# Skill
`,
            },
          }
        }
        if (path === ".opencode/skills/help/SKILL.md") {
          return {
            data: {
              type: "text",
              content: `---
name: help
title: Help
description: Not a report
---

# Help
`,
            },
          }
        }
        throw new Error("not found")
      },
    })

    expect(out).toEqual([
      {
        name: "guests-yesterday-vs-plan",
        title: "Гости вчера vs план",
        description: "Проверяет гостей за вчера",
        aliases: ["гости вчера"],
        category: "report",
        source: "skill",
        template: "# Skill",
      },
    ])
  })
})

describe("reportSkillAliases", () => {
  it("includes name and aliases, deduplicated", () => {
    const out = reportSkillAliases([
      cmd({ name: "report", aliases: ["отчёт", "отчет"], source: "skill" }),
      cmd({ name: "report", aliases: ["отчёт"], source: "skill" }),
    ])
    expect(out).toEqual(["report", "отчёт", "отчет"])
  })

  it("returns empty when no report skills", () => {
    expect(reportSkillAliases([cmd({ name: "help", source: "skill" })])).toEqual([])
  })
})

describe("reportSkillChoices", () => {
  it("returns only the selected skill when it exists", () => {
    const skills = reportSkillCommands([
      cmd({ name: "guests-yesterday-vs-plan", title: "Guests", category: "report", source: "skill" }),
      cmd({ name: "loss-share-breakdown-yesterday", title: "Losses", category: "report", source: "skill" }),
    ])
    expect(reportSkillChoices(skills, "guests-yesterday-vs-plan").map((skill) => skill.name)).toEqual([
      "guests-yesterday-vs-plan",
    ])
  })

  it("falls back to the full list when selected skill is unknown", () => {
    const skills = reportSkillCommands([
      cmd({ name: "guests-yesterday-vs-plan", title: "Guests", category: "report", source: "skill" }),
      cmd({ name: "loss-share-breakdown-yesterday", title: "Losses", category: "report", source: "skill" }),
    ])
    expect(reportSkillChoices(skills, "unknown").map((skill) => skill.name)).toEqual([
      "guests-yesterday-vs-plan",
      "loss-share-breakdown-yesterday",
    ])
  })
})

describe("strictReportSkillChoice", () => {
  it("returns only the selected skill when it exists", () => {
    const skills = reportSkillCommands([
      cmd({ name: "guests-yesterday-vs-plan", title: "Guests", category: "report", source: "skill" }),
      cmd({ name: "loss-share-breakdown-yesterday", title: "Losses", category: "report", source: "skill" }),
    ])
    expect(strictReportSkillChoice(skills, "guests-yesterday-vs-plan").map((skill) => skill.name)).toEqual([
      "guests-yesterday-vs-plan",
    ])
  })

  it("returns empty when selected skill is unknown", () => {
    const skills = reportSkillCommands([
      cmd({ name: "guests-yesterday-vs-plan", title: "Guests", category: "report", source: "skill" }),
      cmd({ name: "loss-share-breakdown-yesterday", title: "Losses", category: "report", source: "skill" }),
    ])
    expect(strictReportSkillChoice(skills, "unknown")).toEqual([])
  })

  it("returns empty when selected skill is missing", () => {
    const skills = reportSkillCommands([
      cmd({ name: "guests-yesterday-vs-plan", title: "Guests", category: "report", source: "skill" }),
    ])
    expect(strictReportSkillChoice(skills, undefined)).toEqual([])
  })
})

const textPart = (id: string, messageID: string, text: string): Part => ({
  id,
  sessionID: "s",
  messageID,
  type: "text",
  text,
})

const userMessage = (id: string): Message => ({
  id,
  sessionID: "s",
  role: "user",
  time: { created: 1 },
  agent: "a",
  model: { providerID: "p", modelID: "m" },
})

const assistantMessage = (id: string, completed?: number): Message => ({
  id,
  sessionID: "s",
  role: "assistant",
  time: { created: 2, completed },
  parentID: "p",
  modelID: "m",
  providerID: "p",
  mode: "default",
  agent: "a",
  path: { cwd: "/", root: "/" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
})

describe("checkReportGenerated", () => {
  it("returns false with no messages", () => {
    expect(checkReportGenerated([], {}, ["report"])).toBe(false)
    expect(checkReportGenerated(undefined, undefined, ["report"])).toBe(false)
  })

  it("returns false with no aliases", () => {
    expect(checkReportGenerated([userMessage("u1")], {}, [])).toBe(false)
  })

  it("returns true when user /report has a completed assistant follow-up", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1", 100)]
    const parts = { u1: [textPart("p1", "u1", "/report")] }
    expect(checkReportGenerated(messages, parts, ["report"])).toBe(true)
  })

  it("returns false when assistant follow-up is still running", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1")]
    const parts = { u1: [textPart("p1", "u1", "/report do stuff")] }
    expect(checkReportGenerated(messages, parts, ["report"])).toBe(false)
  })

  it("matches by alias when user used /отчёт", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1", 100)]
    const parts = { u1: [textPart("p1", "u1", "/отчёт")] }
    expect(checkReportGenerated(messages, parts, ["report", "отчёт"])).toBe(true)
  })

  it("ignores non-command user messages", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1", 100)]
    const parts = { u1: [textPart("p1", "u1", "hello")] }
    expect(checkReportGenerated(messages, parts, ["report"])).toBe(false)
  })

  it("requires whole-word match (does not match /reporting)", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1", 100)]
    const parts = { u1: [textPart("p1", "u1", "/reporting")] }
    expect(checkReportGenerated(messages, parts, ["report"])).toBe(false)
  })

  it("skips synthetic text parts", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1", 100)]
    const parts = {
      u1: [
        { ...textPart("p1", "u1", "/report"), synthetic: true } as Part,
        textPart("p2", "u1", "no command"),
      ],
    }
    expect(checkReportGenerated(messages, parts, ["report"])).toBe(false)
  })
})

describe("hasReportInvocation", () => {
  it("returns false with no messages or no aliases", () => {
    expect(hasReportInvocation([], {}, ["report"])).toBe(false)
    expect(hasReportInvocation(undefined, undefined, ["report"])).toBe(false)
    expect(hasReportInvocation([userMessage("u1")], {}, [])).toBe(false)
  })

  it("returns true when a user message invoked /report even without a completed reply", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1")]
    const parts = { u1: [textPart("p1", "u1", "/report")] }
    expect(hasReportInvocation(messages, parts, ["report"])).toBe(true)
  })

  it("returns false for plain (non-report) chats", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1", 100)]
    const parts = {
      u1: [textPart("p1", "u1", "what skills do you have")],
      a1: [textPart("p2", "a1", "here they are")],
    }
    expect(hasReportInvocation(messages, parts, ["report"])).toBe(false)
  })

  it("matches by alias", () => {
    const messages: Message[] = [userMessage("u1")]
    const parts = { u1: [textPart("p1", "u1", "/отчёт")] }
    expect(hasReportInvocation(messages, parts, ["report", "отчёт"])).toBe(true)
  })
})

describe("findSessionIdByReportPath", () => {
  it("returns the session whose assistant message produced the report path", () => {
    const messageBySession = {
      ses_a: [userMessage("u1"), assistantMessage("a1", 100)],
      ses_b: [userMessage("u2"), assistantMessage("a2", 100)],
    }
    const partByMessage = {
      a1: [textPart("p1", "a1", "irrelevant answer")],
      a2: [textPart("p2", "a2", "Готово: reports/report-2026-05-19-10:00.mdx")],
    }
    expect(
      findSessionIdByReportPath(messageBySession, partByMessage, "reports/report-2026-05-19-10:00.mdx"),
    ).toBe("ses_b")
  })

  it("normalizes a ./ prefixed path", () => {
    const messageBySession = { ses_a: [assistantMessage("a1", 100)] }
    const partByMessage = { a1: [textPart("p1", "a1", "see reports/report-x.md")] }
    expect(findSessionIdByReportPath(messageBySession, partByMessage, "./reports/report-x.md")).toBe("ses_a")
  })

  it("returns undefined when no session references the path", () => {
    const messageBySession = { ses_a: [assistantMessage("a1", 100)] }
    const partByMessage = { a1: [textPart("p1", "a1", "no path here")] }
    expect(findSessionIdByReportPath(messageBySession, partByMessage, "reports/report-x.md")).toBeUndefined()
    expect(findSessionIdByReportPath(undefined, undefined, "reports/report-x.md")).toBeUndefined()
  })
})

describe("extractReportPathFromText", () => {
  it("finds a report path in plain text", () => {
    expect(extractReportPathFromText("Saved to reports/report-2026-05-16-21:15.md.")).toBe(
      "reports/report-2026-05-16-21:15.md",
    )
  })

  it("finds the path inside markdown code fence", () => {
    expect(extractReportPathFromText("Готово, см. `reports/report-2026-05-17-10:00.md`.")).toBe(
      "reports/report-2026-05-17-10:00.md",
    )
  })

  it("handles backslash-free dot prefix", () => {
    expect(extractReportPathFromText("file at ./reports/report-x.md created")).toBe("reports/report-x.md")
  })

  it("returns undefined for unrelated text", () => {
    expect(extractReportPathFromText("nothing here")).toBeUndefined()
    expect(extractReportPathFromText("")).toBeUndefined()
  })

  it("does not match if 'reports' is part of another word", () => {
    expect(extractReportPathFromText("/reports/report.md")).toBe("reports/report.md")
    expect(extractReportPathFromText("ai-reports/report-x.md")).toBeUndefined()
  })
})

describe("findLatestReportPath", () => {
  it("returns the path from the last completed assistant turn following /report", () => {
    const messages: Message[] = [
      userMessage("u1"),
      assistantMessage("a1", 50),
      userMessage("u2"),
      assistantMessage("a2", 100),
    ]
    const parts = {
      u1: [textPart("p1", "u1", "hello")],
      a1: [textPart("p2", "a1", "hi")],
      u2: [textPart("p3", "u2", "/report")],
      a2: [textPart("p4", "a2", "Отчёт: reports/report-2026-05-17-10:30.md")],
    }
    expect(findLatestReportPath(messages, parts, ["report"])).toBe("reports/report-2026-05-17-10:30.md")
  })

  it("returns undefined when assistant turn is not completed", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1")]
    const parts = {
      u1: [textPart("p1", "u1", "/report")],
      a1: [textPart("p2", "a1", "reports/report.md")],
    }
    expect(findLatestReportPath(messages, parts, ["report"])).toBeUndefined()
  })

  it("returns undefined when last assistant turn was not for /report", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1", 100)]
    const parts = {
      u1: [textPart("p1", "u1", "plain question")],
      a1: [textPart("p2", "a1", "answer with reports/report-x.md mention")],
    }
    expect(findLatestReportPath(messages, parts, ["report"])).toBeUndefined()
  })

  it("returns undefined when assistant text has no path", () => {
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1", 100)]
    const parts = {
      u1: [textPart("p1", "u1", "/report")],
      a1: [textPart("p2", "a1", "no path here")],
    }
    expect(findLatestReportPath(messages, parts, ["report"])).toBeUndefined()
  })
})

describe("findLatestReportSkill", () => {
  it("returns the skill that produced the latest report", () => {
    const skills = reportSkillCommands([
      cmd({ name: "guests-yesterday-vs-plan", title: "Guests", category: "report", source: "skill" }),
      cmd({ name: "loss-share-breakdown-yesterday", title: "Losses", category: "report", source: "skill" }),
    ])
    const messages: Message[] = [
      userMessage("u1"),
      assistantMessage("a1", 100),
      userMessage("u2"),
      assistantMessage("a2", 200),
    ]
    const parts = {
      u1: [textPart("p1", "u1", "/guests-yesterday-vs-plan")],
      a1: [textPart("p2", "a1", "Saved to reports/guests-yesterday-vs-plan-2026-05-17.mdx")],
      u2: [textPart("p3", "u2", "/loss-share-breakdown-yesterday")],
      a2: [textPart("p4", "a2", "Saved to reports/loss-share-breakdown-yesterday-2026-05-18.mdx")],
    }

    expect(findLatestReportSkill(skills, messages, parts)?.name).toBe("loss-share-breakdown-yesterday")
  })

  it("matches template-based invocations when the file name is generic", () => {
    const skills = reportSkillCommands([
      cmd({
        name: "guests-yesterday-vs-plan",
        title: "Guests",
        category: "report",
        source: "skill",
        template: "Сколько гостей пришло вчера и как это соотносится с планом?",
      }),
      cmd({
        name: "loss-share-breakdown-yesterday",
        title: "Losses",
        category: "report",
        source: "skill",
        template: "Какой процент от общей выдачи ушёл в порчу?",
      }),
    ])
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1", 100)]
    const parts = {
      u1: [textPart("p1", "u1", "Сколько гостей пришло вчера и как это соотносится с планом? Подготовь отчёт.")],
      a1: [textPart("p2", "a1", "Готово: reports/report-2026-05-19-10:00.mdx")],
    }

    expect(findLatestReportSkill(skills, messages, parts)?.name).toBe("guests-yesterday-vs-plan")
  })

  it("returns undefined when no completed report response exists", () => {
    const skills = reportSkillCommands([
      cmd({ name: "guests-yesterday-vs-plan", title: "Guests", category: "report", source: "skill" }),
    ])
    const messages: Message[] = [userMessage("u1"), assistantMessage("a1")]
    const parts = {
      u1: [textPart("p1", "u1", "/guests-yesterday-vs-plan")],
      a1: [textPart("p2", "a1", "Working on it")],
    }

    expect(findLatestReportSkill(skills, messages, parts)).toBeUndefined()
  })
})

describe("findReportSkillForFile", () => {
  it("returns undefined when no skill matches", () => {
    const skills = [{ name: "report" }, { name: "summary" }]
    expect(findReportSkillForFile(skills, "reports/other-2026-05-19.mdx")).toBeUndefined()
  })

  it("picks the longest-name skill on prefix collision", () => {
    // `report-weekly-x.mdx` matches both regexes; longest skill wins.
    const skills = [{ name: "report" }, { name: "report-weekly" }]
    expect(findReportSkillForFile(skills, "reports/report-weekly-2026-05-19.mdx")?.name).toBe("report-weekly")
  })

  it("order of skills does not matter", () => {
    const a = [{ name: "report" }, { name: "report-weekly" }]
    const b = [{ name: "report-weekly" }, { name: "report" }]
    expect(findReportSkillForFile(a, "reports/report-weekly.mdx")?.name).toBe("report-weekly")
    expect(findReportSkillForFile(b, "reports/report-weekly.mdx")?.name).toBe("report-weekly")
  })

  it("returns the only matching skill when no collision", () => {
    const skills = [{ name: "report" }, { name: "summary" }]
    expect(findReportSkillForFile(skills, "reports/report-2026-05-19.mdx")?.name).toBe("report")
  })

  it("handles empty / nullish skill lists", () => {
    expect(findReportSkillForFile([], "reports/x.mdx")).toBeUndefined()
    expect(findReportSkillForFile(undefined, "reports/x.mdx")).toBeUndefined()
    expect(findReportSkillForFile(null, "reports/x.mdx")).toBeUndefined()
  })
})

describe("hasRealReportArtifact", () => {
  const writePart = (filePath: string, status = "completed"): Part =>
    ({
      id: "t1",
      sessionID: "s",
      messageID: "a1",
      type: "tool",
      callID: "c1",
      tool: "write",
      state: { status, input: { filePath, content: "x" } },
    }) as unknown as Part

  it("is false for missing / empty parts", () => {
    expect(hasRealReportArtifact(undefined)).toBe(false)
    expect(hasRealReportArtifact({})).toBe(false)
  })

  // The core of the fix: a chat that only *mentions* a reports/ path in text
  // (e.g. the skill echoing its own instructions) is NOT a report session, so
  // it must stay in the normal chat list.
  it("is false when text only mentions a report path (no write tool-call)", () => {
    const parts = { a1: [textPart("p1", "a1", "создай файл reports/guests-yesterday.mdx с отчётом")] }
    expect(hasRealReportArtifact(parts)).toBe(false)
  })

  it("is true when a completed write actually wrote a reports/*.mdx file", () => {
    expect(hasRealReportArtifact({ a1: [writePart("reports/guests-yesterday.mdx")] })).toBe(true)
  })

  it("accepts .md and absolute reports/ paths", () => {
    expect(hasRealReportArtifact({ a1: [writePart("reports/weekly.md")] })).toBe(true)
    expect(hasRealReportArtifact({ a1: [writePart("/workspace/reports/weekly.mdx")] })).toBe(true)
  })

  it("is false for a completed write to a non-report path", () => {
    expect(hasRealReportArtifact({ a1: [writePart("src/index.ts")] })).toBe(false)
  })

  it("is false while the report write is still running or errored (not completed)", () => {
    expect(hasRealReportArtifact({ a1: [writePart("reports/weekly.mdx", "running")] })).toBe(false)
    expect(hasRealReportArtifact({ a1: [writePart("reports/weekly.mdx", "error")] })).toBe(false)
    expect(hasRealReportArtifact({ a1: [writePart("reports/weekly.mdx", "pending")] })).toBe(false)
  })

  it("finds the write across multiple messages and part kinds", () => {
    const parts = {
      u1: [textPart("p0", "u1", "/report")],
      a1: [textPart("p1", "a1", "готовлю отчёт"), writePart("reports/report-2026-07-01.mdx")],
    }
    expect(hasRealReportArtifact(parts)).toBe(true)
  })

  it("findReportArtifactPath returns the written path (or undefined)", () => {
    expect(findReportArtifactPath({ a1: [writePart("reports/guests-yesterday.mdx")] })).toBe(
      "reports/guests-yesterday.mdx",
    )
    expect(findReportArtifactPath({ a1: [writePart("src/index.ts")] })).toBeUndefined()
    expect(findReportArtifactPath({ a1: [textPart("p1", "a1", "reports/x.mdx")] })).toBeUndefined()
    expect(findReportArtifactPath(undefined)).toBeUndefined()
  })
})

describe("planReportReconcile", () => {
  const base = { hasFile: false, hasChildren: false, marked: false, now: 1_000_000, minAge: 60_000 }
  const meta = (created: number, archived = false) => ({ archived, created })

  it("keeps a session that has a report file", () => {
    expect(planReportReconcile({ ...base, hasFile: true, meta: meta(0) }).action).toBe("keep")
  })

  it("probes the server when the session is absent from the store", () => {
    expect(planReportReconcile({ ...base, meta: undefined }).action).toBe("probeStale")
  })

  it("skips archived sessions and sessions with children", () => {
    expect(planReportReconcile({ ...base, meta: meta(0, true) }).action).toBe("skip")
    expect(planReportReconcile({ ...base, meta: meta(0), hasChildren: true }).action).toBe("skip")
  })

  it("marks an old empty candidate deletable, a young one not", () => {
    const old = planReportReconcile({ ...base, meta: meta(0), now: 1_000_000 })
    expect(old).toEqual({ action: "checkEmpty", deletable: true, marked: false })
    const young = planReportReconcile({ ...base, meta: meta(1_000_000 - 5_000), now: 1_000_000 })
    expect(young).toEqual({ action: "checkEmpty", deletable: false, marked: false })
  })

  it("carries the marked flag through to the empty check", () => {
    expect(planReportReconcile({ ...base, meta: meta(0), marked: true })).toEqual({
      action: "checkEmpty",
      deletable: true,
      marked: true,
    })
  })
})

describe("readReportSessionId", () => {
  const client = (content: string | undefined) => ({
    read: async () => ({ data: content === undefined ? undefined : { type: "text", content } }),
  })

  it("returns the frontmatter sessionId", async () => {
    expect(await readReportSessionId(client("---\nsessionId: ses_x9\n---\n# Report"), "reports/r.mdx")).toBe("ses_x9")
  })

  it("returns undefined for empty/missing frontmatter — NO assistant-text fallback", async () => {
    expect(await readReportSessionId(client("---\ntitle: no session id here\n---\nbody"), "reports/r.mdx")).toBeUndefined()
    // a body that merely MENTIONS a reports path must not attribute the file
    expect(await readReportSessionId(client("# body mentioning reports/other.mdx"), "reports/r.mdx")).toBeUndefined()
  })

  it("returns undefined when the file can't be read", async () => {
    const bad = {
      read: async () => {
        throw new Error("nope")
      },
    }
    expect(await readReportSessionId(bad, "reports/r.mdx")).toBeUndefined()
  })
})

describe("resolveReportReconcile", () => {
  it("deletes only a report-marked empty session past the age guard", () => {
    expect(resolveReportReconcile({ deletable: true, marked: true }, { empty: true, artifact: false, ambiguous: false })).toBe("delete")
    // not marked → keep (never delete an unrelated empty chat)
    expect(resolveReportReconcile({ deletable: true, marked: false }, { empty: true, artifact: false, ambiguous: false })).toBe("keep")
    // young (just created) → keep
    expect(resolveReportReconcile({ deletable: false, marked: true }, { empty: true, artifact: false, ambiguous: false })).toBe("keep")
  })

  it("unmarks a non-empty marked chat only when it is surely not a report", () => {
    // marked, non-empty, no artifact, old, no ambiguous file → stale mark → reveal
    expect(resolveReportReconcile({ deletable: true, marked: true }, { empty: false, artifact: false, ambiguous: false })).toBe("unmark")
    // HAS write artifact → real report → keep
    expect(resolveReportReconcile({ deletable: true, marked: true }, { empty: false, artifact: true, ambiguous: false })).toBe("keep")
    // an unattributable reports/ file exists (bash, empty frontmatter) → keep
    expect(resolveReportReconcile({ deletable: true, marked: true }, { empty: false, artifact: false, ambiguous: true })).toBe("keep")
    // young (possibly mid-generation) → keep
    expect(resolveReportReconcile({ deletable: false, marked: true }, { empty: false, artifact: false, ambiguous: false })).toBe("keep")
    // not marked → keep
    expect(resolveReportReconcile({ deletable: true, marked: false }, { empty: false, artifact: false, ambiguous: false })).toBe("keep")
  })

})

describe("runReportSessionBackfill", () => {
  type Input = Parameters<typeof runReportSessionBackfill>[0]

  const setup = (overrides: Partial<Input> = {}) => {
    const unmarked: string[] = []
    const marked: Array<[string, string]> = []
    const input: Input = {
      files: [],
      skills: [],
      sessions: [{ id: "ses_old", time: { created: 0 } }],
      marked: new Set(["ses_old"]),
      now: 120_000,
      minAge: 60_000,
      reconcile: true,
      isCurrent: () => true,
      readReportOwner: async () => undefined,
      mark: (sessionID, skillName) => marked.push([sessionID, skillName]),
      unmark: (sessionID) => unmarked.push(sessionID),
      fetchSession: async () => ({ status: "unknown" }),
      readState: async () => ({ empty: false, busy: false }),
      checkArtifact: async () => "stale",
      deleteSession: async () => true,
      ...overrides,
    }
    return { input, unmarked, marked }
  }

  it("actually unmarks a stale chat when the workspace has zero report skills", async () => {
    const test = setup({ skills: [] })
    expect(await runReportSessionBackfill(test.input)).toBe(true)
    expect(test.unmarked).toEqual(["ses_old"])
  })

  it("continues reconciliation after finding a paged-out session on the server", async () => {
    const test = setup({
      sessions: [],
      fetchSession: async () => ({ status: "found", session: { id: "ses_old", time: { created: 0 } } }),
    })
    await runReportSessionBackfill(test.input)
    expect(test.unmarked).toEqual(["ses_old"])
  })

  it("drops a mark when a paged-out session is definitively gone, but not on an uncertain lookup", async () => {
    const gone = setup({ sessions: [], fetchSession: async () => ({ status: "gone" }) })
    await runReportSessionBackfill(gone.input)
    expect(gone.unmarked).toEqual(["ses_old"])

    const uncertain = setup({ sessions: [], fetchSession: async () => ({ status: "unknown" }) })
    await runReportSessionBackfill(uncertain.input)
    expect(uncertain.unmarked).toEqual([])
  })

  it("does not let a historical write hide a chat after its report file disappeared or changed owner", async () => {
    const stale = setup({
      readState: async () => ({ empty: false, busy: false, artifactPath: "reports/old.mdx" }),
      checkArtifact: async () => "stale",
    })
    await runReportSessionBackfill(stale.input)
    expect(stale.unmarked).toEqual(["ses_old"])
  })

  it("keeps the mark when the write artifact is current or cannot be checked safely", async () => {
    const current = setup({
      readState: async () => ({ empty: false, busy: false, artifactPath: "reports/current.mdx" }),
      checkArtifact: async () => "current",
    })
    await runReportSessionBackfill(current.input)
    expect(current.unmarked).toEqual([])

    const uncertain = setup({
      readState: async () => ({ empty: false, busy: false, artifactPath: "reports/current.mdx" }),
      checkArtifact: async () => "unknown",
    })
    await runReportSessionBackfill(uncertain.input)
    expect(uncertain.unmarked).toEqual([])
  })
})

// reportOpenTarget is the gate for opening the report side panel from the
// sidebar. open:true means a generated report exists and the panel opens;
// open:false means not generated yet, so the sidebar must NOT open a phantom
// panel (this is the invariant that fixes the "two Generate buttons" bug).
describe("reportOpenTarget", () => {
  const skill = "breakfast-cost-per-guest-vs-7d"
  const entry = (name: string, type = "file") => ({ type, name, path: `reports/${name}` })
  const closed = { path: expectedReportPath(skill), open: false }

  it("does not open the panel when no report exists", () => {
    expect(reportOpenTarget([], skill)).toEqual(closed)
    expect(reportOpenTarget(undefined, skill)).toEqual(closed)
    expect(reportOpenTarget(null, skill)).toEqual(closed)
    expect(reportOpenTarget([entry("guests-yesterday-vs-plan.mdx")], skill)).toEqual(closed)
  })

  it("does not open the panel for a directory whose name matches", () => {
    expect(reportOpenTarget([entry(`${skill}-2026.mdx`, "directory")], skill)).toEqual(closed)
  })

  it("opens the existing report (.md or .mdx), even alongside unrelated files", () => {
    expect(reportOpenTarget([entry(`${skill}.mdx`)], skill)).toEqual({ path: `reports/${skill}.mdx`, open: true })
    expect(reportOpenTarget([entry(`${skill}-2026-06-22.md`)], skill)).toEqual({
      path: `reports/${skill}-2026-06-22.md`,
      open: true,
    })
    expect(reportOpenTarget([entry("notes.txt"), entry(`${skill}.mdx`)], skill)).toEqual({
      path: `reports/${skill}.mdx`,
      open: true,
    })
  })

  it("opens the lexicographically last matching file", () => {
    const files = [entry(`${skill}-2026-06-10-09:00.mdx`), entry(`${skill}-2026-06-22-11:54.mdx`)]
    expect(reportOpenTarget(files, skill)).toEqual({ path: `reports/${skill}-2026-06-22-11:54.mdx`, open: true })
  })
})
