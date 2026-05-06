import { beforeEach, describe, expect, test } from "bun:test"
import { isPromptInputTrayEnabled, readLocalStorageFlag, SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY } from "./feature-flags"

describe("feature flags", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test("readLocalStorageFlag uses defaultValue when key is unset", () => {
    expect(readLocalStorageFlag(SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY)).toBe(false)
    expect(readLocalStorageFlag(SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY, true)).toBe(true)
  })

  test("prompt input tray is enabled by default", () => {
    expect(isPromptInputTrayEnabled()).toBe(true)
  })

  test("prompt input tray accepts explicit truthy values", () => {
    localStorage.setItem(SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY, "true")
    expect(isPromptInputTrayEnabled()).toBe(true)

    localStorage.setItem(SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY, "1")
    expect(isPromptInputTrayEnabled()).toBe(true)
  })

  test("prompt input tray accepts explicit falsy values", () => {
    localStorage.setItem(SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY, "false")
    expect(isPromptInputTrayEnabled()).toBe(false)

    localStorage.setItem(SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY, "0")
    expect(isPromptInputTrayEnabled()).toBe(false)

    localStorage.setItem(SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY, "off")
    expect(isPromptInputTrayEnabled()).toBe(false)
  })

  test("prompt input tray falls back to default for unrecognized values", () => {
    localStorage.setItem(SHOW_PROMPT_INPUT_TRAY_STORAGE_KEY, "maybe")
    expect(isPromptInputTrayEnabled()).toBe(true)
  })
})
