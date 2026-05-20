import { describe, expect, test } from "bun:test"
import { canDisposeDirectory, pickDirectoriesToEvict } from "./global-sync/eviction"
import { estimateRootSessionTotal, loadRootSessionsWithFallback } from "./global-sync/session-load"

describe("pickDirectoriesToEvict", () => {
  test("keeps pinned stores and evicts idle stores", () => {
    const now = 5_000
    const picks = pickDirectoriesToEvict({
      stores: ["a", "b", "c", "d"],
      state: new Map([
        ["a", { lastAccessAt: 1_000 }],
        ["b", { lastAccessAt: 4_900 }],
        ["c", { lastAccessAt: 4_800 }],
        ["d", { lastAccessAt: 3_000 }],
      ]),
      pins: new Set(["a"]),
      max: 2,
      ttl: 1_500,
      now,
    })

    expect(picks).toEqual(["d", "c"])
  })
})

describe("loadRootSessionsWithFallback", () => {
  const fakeSession = (id: string) => ({ id }) as never

  test("requests limit+1 so hasMore can be detected without a count call", async () => {
    const calls: Array<{ directory: string; roots: true; limit?: number }> = []

    const result = await loadRootSessionsWithFallback({
      directory: "dir",
      limit: 10,
      list: async (query) => {
        calls.push(query)
        return { data: [] }
      },
    })

    expect(result.data).toEqual([])
    expect(result.limit).toBe(10)
    expect(result.limited).toBe(true)
    expect(result.hasMore).toBe(false)
    expect(calls).toEqual([{ directory: "dir", roots: true, limit: 11 }])
  })

  test("hasMore=false when server returns fewer than limit rows", async () => {
    const result = await loadRootSessionsWithFallback({
      directory: "dir",
      limit: 10,
      list: async () => ({ data: Array.from({ length: 9 }, (_, i) => fakeSession(`s${i}`)) }),
    })

    expect(result.data?.length).toBe(9)
    expect(result.hasMore).toBe(false)
  })

  test("hasMore=false when server returns exactly limit rows (no extra in response)", async () => {
    const result = await loadRootSessionsWithFallback({
      directory: "dir",
      limit: 10,
      list: async () => ({ data: Array.from({ length: 10 }, (_, i) => fakeSession(`s${i}`)) }),
    })

    // Asked for 11 but got 10 → there is no next page, even though .length === limit.
    expect(result.data?.length).toBe(10)
    expect(result.hasMore).toBe(false)
  })

  test("hasMore=true when server returns limit+1, and data is sliced down to limit", async () => {
    const result = await loadRootSessionsWithFallback({
      directory: "dir",
      limit: 10,
      list: async () => ({ data: Array.from({ length: 11 }, (_, i) => fakeSession(`s${i}`)) }),
    })

    expect(result.data?.length).toBe(10)
    expect(result.hasMore).toBe(true)
  })

  test("falls back to full roots query on limited-query failure", async () => {
    const calls: Array<{ directory: string; roots: true; limit?: number }> = []

    const result = await loadRootSessionsWithFallback({
      directory: "dir",
      limit: 25,
      list: async (query) => {
        calls.push(query)
        if (query.limit) throw new Error("unsupported")
        return { data: [] }
      },
    })

    expect(result.data).toEqual([])
    expect(result.limited).toBe(false)
    expect(result.hasMore).toBe(false)
    expect(calls).toEqual([
      { directory: "dir", roots: true, limit: 26 },
      { directory: "dir", roots: true },
    ])
  })
})

describe("estimateRootSessionTotal", () => {
  test("keeps exact total for full fetches", () => {
    expect(estimateRootSessionTotal({ count: 42, limit: 10, limited: false })).toBe(42)
  })

  test("marks has-more for full-limit limited fetches", () => {
    expect(estimateRootSessionTotal({ count: 10, limit: 10, limited: true })).toBe(11)
  })

  test("keeps exact total when limited fetch is under limit", () => {
    expect(estimateRootSessionTotal({ count: 9, limit: 10, limited: true })).toBe(9)
  })
})

describe("canDisposeDirectory", () => {
  test("rejects pinned or inflight directories", () => {
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: true,
        booting: false,
        loadingSessions: false,
      }),
    ).toBe(false)
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: false,
        booting: true,
        loadingSessions: false,
      }),
    ).toBe(false)
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: false,
        booting: false,
        loadingSessions: true,
      }),
    ).toBe(false)
  })

  test("accepts idle unpinned directory store", () => {
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: false,
        booting: false,
        loadingSessions: false,
      }),
    ).toBe(true)
  })
})
