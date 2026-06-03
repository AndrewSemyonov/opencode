import { createSimpleContext } from "@opencode-ai/ui/context"
import { createResource, createSignal, Show, type JSX } from "solid-js"
import { useGlobalSDK } from "./global-sdk"

export type AuthRole = "full" | "readonly"

interface AuthInfo {
  role: AuthRole
  loaded: boolean
}

/**
 * Reports which credential role the server admitted the current session as.
 * `GET /info` was added on the OpenCode-side as a tiny endpoint that just
 * echoes `c.get('authRole')`. We fetch it at boot and use it across the SPA
 * to hide mutation controls when running as `readonly`.
 *
 * Fail-safe behaviour: on any error we assume `readonly` so we don't
 * accidentally expose write-only UI when the request failed for some other
 * reason. The server-side enforcement still rejects writes regardless.
 */
export const { use: useAuthRole, provider: AuthRoleProviderBase } = createSimpleContext<
  AuthInfo,
  { value: AuthInfo }
>({
  name: "AuthRole",
  init: (props) => props.value,
  gate: false,
})

export function AuthRoleProvider(props: { children: JSX.Element }) {
  const sdk = useGlobalSDK()
  const [info, setInfo] = createSignal<AuthInfo>({ role: "full", loaded: false })

  createResource(async () => {
    try {
      const res = await fetch(new URL("/info", sdk.url).toString(), {
        credentials: "include",
      })
      if (!res.ok) {
        setInfo({ role: "readonly", loaded: true })
        return null
      }
      const body = (await res.json()) as { authRole?: AuthRole }
      const role: AuthRole = body.authRole === "readonly" ? "readonly" : "full"
      setInfo({ role, loaded: true })
      return body
    } catch {
      setInfo({ role: "readonly", loaded: true })
      return null
    }
  })

  return <AuthRoleProviderBase value={info()}>{props.children}</AuthRoleProviderBase>
}

/** Sticky banner shown when the session is read-only. */
export function ReadonlyBanner() {
  const info = useAuthRole()
  return (
    <Show when={info.loaded && info.role === "readonly"}>
      <div
        style={{
          position: "sticky",
          top: 0,
          "z-index": 9999,
          background: "#b91c1c",
          color: "white",
          "text-align": "center",
          padding: "6px 12px",
          "font-size": "13px",
          "font-weight": 500,
        }}
      >
        Read-only view by admin — write operations are disabled
      </div>
    </Show>
  )
}
