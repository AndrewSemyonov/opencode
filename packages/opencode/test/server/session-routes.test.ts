import { describe, expect, test } from "bun:test"
import { SessionRoutes } from "../../src/server/instance/session"

/**
 * Cheap regression guard: verify the routes opspace's SessionsSyncService
 * relies on are registered. Doesn't exercise handler logic (that needs the
 * full Effect runtime + DB), but catches accidental removal/typo of the path.
 */
describe("SessionRoutes", () => {
  const app = SessionRoutes()
  const declared = app.routes.map((r) => `${r.method} ${r.path}`)

  test("declares GET /export-all (opspace bulk sync)", () => {
    expect(declared).toContain("GET /export-all")
  })

  test("declares GET /:sessionID and GET /:sessionID/message (opspace per-session sync)", () => {
    expect(declared).toContain("GET /:sessionID")
    expect(declared).toContain("GET /:sessionID/message")
  })

  test("declares GET / (list)", () => {
    expect(declared).toContain("GET /")
  })
})
