import type { RootLoadArgs } from "./types"

export async function loadRootSessionsWithFallback(input: RootLoadArgs) {
  try {
    // Request limit+1 so we can detect "is there a next page" without a separate
    // count call — session.list returns at most the requested limit and has no
    // hasMore/total in the response. Mirrors packages/opencode/src/server/instance/experimental.ts.
    const fetchLimit = input.limit + 1
    const result = await input.list({ directory: input.directory, roots: true, limit: fetchLimit })
    const all = result.data ?? []
    const hasMore = all.length > input.limit
    return {
      data: hasMore ? all.slice(0, input.limit) : all,
      limit: input.limit,
      limited: true,
      hasMore,
    } as const
  } catch {
    const result = await input.list({ directory: input.directory, roots: true })
    return {
      data: result.data,
      limit: input.limit,
      limited: false,
      hasMore: false,
    } as const
  }
}

export function estimateRootSessionTotal(input: { count: number; limit: number; limited: boolean }) {
  if (!input.limited) return input.count
  if (input.count < input.limit) return input.count
  return input.count + 1
}
