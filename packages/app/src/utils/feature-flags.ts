export const SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY = "opencode.debug.showPromptInputTray"

export function readLocalStorageFlag(key: string, defaultValue = false) {
  if (typeof localStorage === "undefined") return defaultValue

  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return defaultValue

    const normalized = raw.trim().toLowerCase()
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false
    return defaultValue
  } catch {
    return defaultValue
  }
}

export function isPromptInputTrayEnabled() {
  return readLocalStorageFlag(SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY, true)
}
