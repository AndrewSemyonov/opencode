import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { Hono } from "hono"
import { AuthMiddleware, ReadonlyEnforcementMiddleware } from "../../src/server/middleware"

function buildApp() {
  const app = new Hono()
  app.use(AuthMiddleware)
  app.use(ReadonlyEnforcementMiddleware)
  app.get("/ping", (c) => c.text("pong"))
  app.post("/ping", (c) => c.text("written"))
  app.patch("/ping", (c) => c.text("patched"))
  app.delete("/ping", (c) => c.text("deleted"))
  return app
}

function basic(user: string, pass: string) {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64")
}

describe("AuthMiddleware + ReadonlyEnforcementMiddleware", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.OPENCODE_SERVER_USERNAME
    delete process.env.OPENCODE_SERVER_PASSWORD
    delete process.env.OPENCODE_READONLY_USERNAME
    delete process.env.OPENCODE_READONLY_PASSWORD
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test("no env vars → all methods pass without auth", async () => {
    const app = buildApp()
    expect((await app.request("/ping")).status).toBe(200)
    expect((await app.request("/ping", { method: "POST" })).status).toBe(200)
  })

  test("full creds: allow full access on any method", async () => {
    process.env.OPENCODE_SERVER_PASSWORD = "topsecret"
    const app = buildApp()

    const res = await app.request("/ping", {
      method: "POST",
      headers: { Authorization: basic("opencode", "topsecret") },
    })
    expect(res.status).toBe(200)
  })

  test("read-only creds: GET allowed", async () => {
    process.env.OPENCODE_SERVER_PASSWORD = "topsecret"
    process.env.OPENCODE_READONLY_PASSWORD = "readme"
    const app = buildApp()

    const res = await app.request("/ping", {
      headers: { Authorization: basic("opencode-readonly", "readme") },
    })
    expect(res.status).toBe(200)
  })

  test("read-only creds: POST/PATCH/DELETE → 403", async () => {
    process.env.OPENCODE_SERVER_PASSWORD = "topsecret"
    process.env.OPENCODE_READONLY_PASSWORD = "readme"
    const app = buildApp()
    const auth = basic("opencode-readonly", "readme")

    for (const method of ["POST", "PATCH", "DELETE"]) {
      const res = await app.request("/ping", {
        method,
        headers: { Authorization: auth },
      })
      expect(res.status).toBe(403)
    }
  })

  test("wrong password rejected", async () => {
    process.env.OPENCODE_SERVER_PASSWORD = "topsecret"
    const app = buildApp()
    const res = await app.request("/ping", {
      headers: { Authorization: basic("opencode", "nope") },
    })
    expect(res.status).toBe(401)
  })

  test("only RO password set: full credentials are not accepted", async () => {
    process.env.OPENCODE_READONLY_PASSWORD = "readme"
    const app = buildApp()

    const ro = await app.request("/ping", {
      headers: { Authorization: basic("opencode-readonly", "readme") },
    })
    expect(ro.status).toBe(200)

    const bad = await app.request("/ping", {
      headers: { Authorization: basic("opencode", "readme") },
    })
    expect(bad.status).toBe(401)
  })

  test("OPTIONS bypasses auth (CORS preflight)", async () => {
    process.env.OPENCODE_SERVER_PASSWORD = "topsecret"
    const app = buildApp()
    const res = await app.request("/ping", { method: "OPTIONS" })
    // Hono returns 404 for unmatched OPTIONS, but the important thing is no auth challenge
    expect(res.status).not.toBe(401)
  })
})
