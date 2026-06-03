import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { AuthMiddleware, ReadonlyEnforcementMiddleware } from "../../src/server/middleware"
import { SessionRoutes } from "../../src/server/instance/session"

function basic(user: string, pass: string) {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64")
}

/**
 * Regression guard for the defence-in-depth check inside
 * `GET /session/export-all` that rejects the readonly credential pair.
 *
 * We don't mount the full Effect runtime — the guard runs at the top of the
 * handler and returns 403 before reaching `Session.list`. If the guard is
 * removed, this test starts seeing the request progress past auth and the
 * shape changes (most likely 500 from the missing runtime).
 */
describe("GET /session/export-all readonly guard", () => {
  const originalEnv = { ...process.env }

  function buildApp() {
    const app = new Hono()
    app.use(AuthMiddleware)
    app.use(ReadonlyEnforcementMiddleware)
    app.route("/session", SessionRoutes())
    return app
  }

  test("readonly creds → 403 even though it's a GET", async () => {
    process.env.OPENCODE_SERVER_PASSWORD = "full-pass"
    process.env.OPENCODE_READONLY_PASSWORD = "ro-pass"
    try {
      const app = buildApp()
      const res = await app.request("/session/export-all", {
        headers: { Authorization: basic("opencode-readonly", "ro-pass") },
      })
      expect(res.status).toBe(403)
      expect(await res.text()).toMatch(/full-access/i)
    } finally {
      process.env = { ...originalEnv }
    }
  })
})
