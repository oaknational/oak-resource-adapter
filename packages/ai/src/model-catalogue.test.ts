import { describe, expect, expectTypeOf, it } from "vitest";

import type { ModelId, ModelProvider } from "./index.js";
import { providerForModel, SUPPORTED_MODELS } from "./index.js";

describe("model catalogue", () => {
  it("constrains model IDs to the supported catalogue", () => {
    expectTypeOf<ModelId>().toEqualTypeOf<keyof typeof SUPPORTED_MODELS>();
    expectTypeOf<"gpt-5.4-2026-03-05">().toExtend<ModelId>();
    // @ts-expect-error an unlisted model is not a valid ModelId
    expectTypeOf<"totally-not-a-real-model">().toExtend<ModelId>();
  });

  it("resolves each catalogued model to a known provider", () => {
    for (const model of Object.keys(SUPPORTED_MODELS) as ModelId[]) {
      expectTypeOf(providerForModel(model)).toEqualTypeOf<ModelProvider>();
      expect(providerForModel(model)).toBe("openai");
    }
  });
});
