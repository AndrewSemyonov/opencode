// Number of *visible* (non-report) sessions one "Load more" click aims to add.
export const SESSION_PAGE_SIZE = 5

// Pages the session window forward until either a full page of visible
// (non-report) sessions has been revealed, or the server has no more rows.
//
// Pagination is driven by raw server rows (the `limit`), but the sidebar hides
// report sessions, so a raw page can add zero visible rows. Instead of a fixed
// page cap (which strands the user when many report sessions are interleaved),
// we keep paging until the visible count advances by a page or the server is
// exhausted. A raw-progress guard stops the loop if the server stops returning
// new rows while still reporting hasMore, so it can never spin indefinitely.
export async function pageUntilVisibleProgress(input: {
  visibleCount: () => number
  rawCount: () => number
  hasMore: () => boolean
  bumpLimit: () => void
  reload: () => Promise<void> | void
}): Promise<void> {
  const target = input.visibleCount() + SESSION_PAGE_SIZE
  let prevRaw = input.rawCount()
  while (input.hasMore() && input.visibleCount() < target) {
    input.bumpLimit()
    await input.reload()
    const raw = input.rawCount()
    // No new rows came back despite hasMore — bail so we don't loop forever.
    if (raw <= prevRaw) break
    prevRaw = raw
  }
}
