export type ModelKey = {
  providerID: string
  modelID: string
}

export type ActiveModelLabel = {
  name: string
  provider: {
    id: string
  }
}

export const PREFERRED_DEFAULT_MODEL = {
  providerID: "openrouter",
  modelID: "google/gemini-3-flash-preview",
} as const satisfies ModelKey

export const HARDCODED_ACTIVE_MODEL: ModelKey | undefined = {
  providerID: "openrouter",
  modelID: "openai/gpt-5.4-mini",
}

export function formatActiveModelLabel(model: ActiveModelLabel) {
  return `${model.provider.id} / ${model.name}`
}
