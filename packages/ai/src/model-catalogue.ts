export const MODEL_PROVIDERS = ["openai"] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

type ModelCatalogueEntry = Readonly<{
  provider: ModelProvider;
}>;

export const SUPPORTED_MODELS = {
  "gpt-5.4-2026-03-05": { provider: "openai" },
} as const satisfies Readonly<Record<string, ModelCatalogueEntry>>;

/**
 * The physical model identifier accepted by {@link defineModelRoutes}.
 */
export type ModelId = keyof typeof SUPPORTED_MODELS;

/**
 * Each model belongs to exactly one provider, so the provider is derived from
 * the model and is never supplied by callers.
 */
export function providerForModel(model: ModelId): ModelProvider {
  return SUPPORTED_MODELS[model].provider;
}
