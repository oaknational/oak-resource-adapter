import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InvocationRecorder } from "@oaknational/resource-adapter-ai";

const mocks = vi.hoisted(() => {
  const recorder = {
    recordStarted: vi.fn<InvocationRecorder["recordStarted"]>(),
    recordSucceeded: vi.fn<InvocationRecorder["recordSucceeded"]>(),
    recordFailed: vi.fn<InvocationRecorder["recordFailed"]>(),
  };
  return {
    recorder,
    databaseRecorder: vi.fn(() => recorder),
    openai: vi.fn(function () {
      return {
        responses: {
          create: async () => ({
            id: "local-sdk-response",
            status: "completed",
            output: [],
            output_text: "local SDK response",
          }),
        },
      };
    }),
  };
});

vi.mock("openai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("openai")>()),
  default: mocks.openai,
}));

vi.mock("@oaknational/resource-adapter-ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@oaknational/resource-adapter-ai")>()),
  createDatabaseInvocationRecorder: mocks.databaseRecorder,
}));

import { createApplicationModelInvoker } from "./application-invoker";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MODEL_TRANSPORT", undefined);
  vi.stubEnv("OPENAI_API_KEY", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => vi.unstubAllEnvs());

describe("application model transport selection", () => {
  it.each([
    { selector: undefined, key: undefined },
    { selector: "openai", key: undefined },
    { selector: undefined, key: "" },
    { selector: "openai", key: "" },
    { selector: undefined, key: " \t\n" },
  ])("requires an API key for $selector with key $key", ({ selector, key }) => {
    vi.stubEnv("MODEL_TRANSPORT", selector);
    vi.stubEnv("OPENAI_API_KEY", key);
    expect(() => createApplicationModelInvoker("attempt")).toThrow(
      expect.objectContaining({
        code: "INVALID_CONFIGURATION",
        message: "OPENAI_API_KEY is not configured.",
      }),
    );
    expect(mocks.openai).not.toHaveBeenCalled();
    expect(mocks.databaseRecorder).not.toHaveBeenCalled();
  });

  it.each([undefined, "openai"])(
    "uses the SDK and openai audit binding for %s",
    async (selector) => {
      vi.stubEnv("MODEL_TRANSPORT", selector);
      vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
      const result = await createApplicationModelInvoker("attempt-openai").invokeText({
        role: "dev-smoke",
        request: { input: "Local constructor double only" },
      });
      expect(result).toMatchObject({
        outcome: "SUCCESS",
        output: "local SDK response",
      });
      expect(mocks.openai).toHaveBeenCalledOnce();
      expect(mocks.databaseRecorder).toHaveBeenCalledWith({
        transformationAttemptId: "attempt-openai",
      });
      expect(mocks.recorder.recordStarted).toHaveBeenCalledWith(
        expect.objectContaining({ transport: "openai", provider: "openai" }),
      );
    },
  );

  it.each([
    { key: undefined, vercel: undefined, node: "test" },
    { key: "test-only-not-a-real-key", vercel: undefined, node: "test" },
    { key: undefined, vercel: "preview", node: "production" },
    { key: "test-only-not-a-real-key", vercel: undefined, node: "production" },
    { key: undefined, vercel: "development", node: "production" },
  ])(
    "selects deterministic without constructing OpenAI: $key / $vercel / $node",
    async ({ key, vercel, node }) => {
      vi.stubEnv("MODEL_TRANSPORT", "deterministic");
      vi.stubEnv("OPENAI_API_KEY", key);
      vi.stubEnv("VERCEL_ENV", vercel);
      vi.stubEnv("NODE_ENV", node);
      const result = await createApplicationModelInvoker(
        "attempt-deterministic",
      ).invokeStructured({
        role: "worksheet-scaffold",
        request: { input: "Add vocabulary support" },
        schemaName: "word_bank_low",
        schema: z.strictObject({
          entries: z.array(z.strictObject({ term: z.string() })).min(1),
        }),
      });
      expect(result).toMatchObject({
        outcome: "SUCCESS",
        output: { entries: [{ term: "compare" }] },
      });
      expect(mocks.openai).not.toHaveBeenCalled();
      expect(mocks.databaseRecorder).toHaveBeenCalledWith({
        transformationAttemptId: "attempt-deterministic",
      });
      expect(mocks.recorder.recordStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-5.6-luna",
          provider: "openai",
          transport: "deterministic",
          role: "worksheet-scaffold",
        }),
      );
      expect(mocks.recorder.recordSucceeded).toHaveBeenCalledWith(
        expect.objectContaining({ outputValidationStatus: "VALID" }),
      );
      expect(mocks.recorder.recordFailed).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "test-only-not-a-real-key"])(
    "rejects deterministic on Vercel production regardless of API key: %s",
    (key) => {
      vi.stubEnv("MODEL_TRANSPORT", "deterministic");
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("OPENAI_API_KEY", key);
      expect(() => createApplicationModelInvoker("attempt")).toThrow(
        expect.objectContaining({
          code: "INVALID_CONFIGURATION",
          message: "Deterministic model transport is not allowed in production.",
        }),
      );
      expect(mocks.openai).not.toHaveBeenCalled();
      expect(mocks.databaseRecorder).not.toHaveBeenCalled();
    },
  );

  it.each(["", "unknown", "DETERMINISTIC", " deterministic "])(
    "rejects invalid selector %j instead of falling back",
    (selector) => {
      vi.stubEnv("MODEL_TRANSPORT", selector);
      vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
      expect(() => createApplicationModelInvoker("attempt")).toThrow(
        expect.objectContaining({
          code: "INVALID_CONFIGURATION",
          message: "MODEL_TRANSPORT must be openai or deterministic.",
        }),
      );
      expect(mocks.openai).not.toHaveBeenCalled();
      expect(mocks.databaseRecorder).not.toHaveBeenCalled();
    },
  );
});
