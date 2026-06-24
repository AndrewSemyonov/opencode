import { describe, expect, test } from "bun:test"
import { pageUntilVisibleProgress, SESSION_PAGE_SIZE } from "./session-paging"

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
