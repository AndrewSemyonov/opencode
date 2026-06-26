import { describe, expect, test } from "bun:test"
import { moreSessionsAvailable, pageUntilVisibleProgress, SESSION_PAGE_SIZE } from "./session-paging"

describe("moreSessionsAvailable", () => {
  const root = (id: string) => ({ id, parentID: null })

  test("true when the server still reports raw hasMore", () => {
    expect(moreSessionsAvailable({ session: [root("a")], hasMore: true, sessionTotal: 1 })).toBe(true)
  })

  test("true when more roots exist than are loaded (trimmed/report-heavy first page)", () => {
    // 5 roots loaded, but the server has 8 — the other 3 were trimmed out and
    // Load more must appear even though raw hasMore is false.
    const session = Array.from({ length: 5 }, (_, i) => root(`s${i}`))
    expect(moreSessionsAvailable({ session, hasMore: false, sessionTotal: 8 })).toBe(true)
  })

  test("false when everything is loaded — extras are only filtered reports", () => {
    // All 6 roots are loaded; some are report sessions hidden by the sidebar,
    // but there is nothing more to fetch, so no Load more.
    const session = Array.from({ length: 6 }, (_, i) => root(`s${i}`))
    expect(moreSessionsAvailable({ session, hasMore: false, sessionTotal: 6 })).toBe(false)
  })

  test("ignores child and archived sessions when counting loaded roots", () => {
    const session = [
      root("r1"),
      { id: "c1", parentID: "r1" }, // child — not a root
      { id: "a1", parentID: null, time: { archived: 123 } }, // archived root
    ]
    // Only 1 real loaded root; server has 3 roots → more available.
    expect(moreSessionsAvailable({ session, hasMore: false, sessionTotal: 3 })).toBe(true)
    // Server total equals the single loaded root → nothing more.
    expect(moreSessionsAvailable({ session, hasMore: false, sessionTotal: 1 })).toBe(false)
  })

  test("handles missing fields gracefully", () => {
    expect(moreSessionsAvailable({})).toBe(false)
    expect(moreSessionsAvailable({ hasMore: true })).toBe(true)
  })

  test("converges to false as the limit grows — no permanent 'Load more'", () => {
    // Models the global-sync trim: the store keeps only the first `limit` roots,
    // while the server holds `total`. Each Load more raises the limit by a page.
    const total = 8
    let limit = SESSION_PAGE_SIZE // 5
    const store = () => ({
      hasMore: false,
      sessionTotal: total,
      session: Array.from({ length: Math.min(limit, total) }, (_, i) => ({ id: `s${i}`, parentID: null })),
    })
    expect(moreSessionsAvailable(store())).toBe(true) // 5 loaded < 8
    limit += SESSION_PAGE_SIZE // 10
    expect(moreSessionsAvailable(store())).toBe(false) // all 8 loaded → button hides
  })
})

// Simulates the server-backed session window the sidebar pages through. `rows`
// is the full ordered list; "r" = report session (hidden), "n" = normal chat
// (visible). The window holds the first `limit` rows, mirroring
// loadRootSessionsWithFallback (raw rows trimmed to limit, hasMore = more exist).
function makeWindow(rows: string[]) {
  let limit = SESSION_PAGE_SIZE
  let window: string[] = []
  let reloads = 0
  const reload = () => {
    reloads++
    window = rows.slice(0, limit)
  }
  reload() // initial page
  return {
    get reloads() {
      return reloads
    },
    visibleCount: () => window.filter((r) => r === "n").length,
    rawCount: () => window.length,
    hasMore: () => rows.length > limit,
    bumpLimit: () => {
      limit += SESSION_PAGE_SIZE
    },
    reload,
  }
}

describe("pageUntilVisibleProgress", () => {
  test("reveals normal chats stranded behind a page of report sessions", async () => {
    // Newest 7 rows are reports; the 5 normal chats sit past the first page.
    const rows = [...Array(7).fill("r"), ...Array(5).fill("n")]
    const w = makeWindow(rows)
    expect(w.visibleCount()).toBe(0) // first page is all reports — looks empty

    await pageUntilVisibleProgress(w)

    // The old fixed-cap loop could stop early; this surfaces a full visible page.
    expect(w.visibleCount()).toBeGreaterThanOrEqual(SESSION_PAGE_SIZE)
  })

  test("adds exactly one page and does not over-fetch when chats are plentiful", async () => {
    const rows = [...Array(100).fill("n")] // plenty visible immediately
    const w = makeWindow(rows)
    expect(w.visibleCount()).toBe(SESSION_PAGE_SIZE)
    const before = w.reloads
    await pageUntilVisibleProgress(w)
    expect(w.visibleCount()).toBe(SESSION_PAGE_SIZE * 2) // one more page revealed
    expect(w.reloads).toBe(before + 1) // exactly one extra fetch — no over-paging
  })

  test("terminates when the server stops returning new rows despite hasMore", async () => {
    let reloads = 0
    await pageUntilVisibleProgress({
      visibleCount: () => 0,
      rawCount: () => 5, // never grows
      hasMore: () => true, // server keeps claiming more
      bumpLimit: () => {},
      reload: () => {
        reloads++
      },
    })
    expect(reloads).toBeLessThanOrEqual(1) // bails on no raw progress, no infinite loop
  })

  test("stops when the server is exhausted even if no visible page was reached", async () => {
    const rows = [...Array(8).fill("r")] // every row is a report; no normal chats
    const w = makeWindow(rows)
    await pageUntilVisibleProgress(w)
    expect(w.visibleCount()).toBe(0)
    expect(w.hasMore()).toBe(false) // paged to the end, then stopped
  })
})
