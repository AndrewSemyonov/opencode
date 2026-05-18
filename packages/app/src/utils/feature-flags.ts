export const SHOW_MODEL_SELECTOR_STORAGE_KEY = "opencode.debug.showModelSelector"

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

export const MODEL_SELECTOR_ENABLED = readLocalStorageFlag(SHOW_MODEL_SELECTOR_STORAGE_KEY)
