import OpenAI from "openai";
import { describe, expect, it } from "vitest";

import { createOpenAIResponsesTransport, DEFAULT_TIMEOUT_MS } from "./index.js";

/**
 * Live smoke test against the real OpenAI API. Run by hand
 * with `pnpm smoke:openai`, never from CI or the `test:integration` suite.
 * Without `RUN_OPENAI_INTEGRATION_TESTS=1` it reports as skipped.
 */
const describeWithOpenAI =
  process.env.RUN_OPENAI_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithOpenAI("openai responses transport (live)", () => {
  it(
    "makes one small live OpenAI call and gets text back",
    async () => {
      // Constructed inside the test: a skipped suite still evaluates the
      // module body, and eager construction would demand the key everywhere.
      const transport = createOpenAIResponsesTransport({ client: new OpenAI() });

      const prepared = transport.prepare(
        {
          invocationId: "openai-smoke-test",
          model: "gpt-5.6-luna",
          provider: "openai",
          request: {
            input: "Reply with the single word: pong",
            max_output_tokens: 64,
          },
          role: "smoke-test",
          transport: "openai",
        },
        { kind: "TEXT" },
      );
      const result = await prepared.execute({
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      if (result.kind === "FAILURE") {
        throw result.error;
      }
      expect(result.response.providerResponseId).toMatch(/^resp_/);
      expect(result.response.usage?.totalTokens).toBeGreaterThan(0);
      const output = result.response.output;
      if (output.kind !== "TEXT") {
        // If the model spends its budget on reasoning this comes back INCOMPLETE;
        // raise max_output_tokens above rather than weakening this.
        throw new Error(`Expected TEXT output, got ${output.kind}.`);
      }
      expect(output.text).not.toBe("");
    },
    DEFAULT_TIMEOUT_MS + 5_000,
  );
});
