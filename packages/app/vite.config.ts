import { defineConfig } from "vite"
import desktopPlugin from "./vite"

const API_TARGET = process.env.OPENCODE_API_TARGET ?? "http://localhost:4096"
const API_PROXY_PATHS = [
  "/agent",
  "/auth",
  "/command",
  "/config",
  "/event",
  "/experimental",
  "/file",
  "/find",
  "/formatter",
  "/global",
  "/instance",
  "/log",
  "/lsp",
  "/mcp",
  "/path",
  "/project",
  "/provider",
  "/pty",
  "/question",
  "/session",
  "/tui",
  "/vcs",
  // additional paths used by app SDK / extras
  "/account",
  "/app",
  "/ide",
  "/installation",
  "/model",
  "/permission",
  "/share",
  "/skill",
  "/snapshot",
  "/sync",
  "/v2",
  "/workspace",
]
const apiProxy = Object.fromEntries(
  API_PROXY_PATHS.map((p) => [p, { target: API_TARGET, changeOrigin: true, ws: true }]),
)

export default defineConfig({
  plugins: [desktopPlugin] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
    proxy: apiProxy,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: apiProxy,
  },
  build: {
    target: "esnext",
    // sourcemap: true,
  },
})
