import type { RoleBinding } from "@oaknational/resource-adapter-ai";
import { setErrorReporter } from "@oaknational/resource-adapter-logger";
import { DrizzleQueryError } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

import type { ResourceAdapterModelInvoker } from "@/ai/model-roles";
import { createCachedTranscriptSummariser } from "./cache";
import type { TranscriptSummary } from "./schema";

const summary: TranscriptSummary = {
  learningCycles: [],
  unassignedTranscriptContent: [
    "Perspective changes whose experience a story presents.",
  ],
};

const openai: RoleBinding = { model: "gpt-6-luna", transport: "openai" };

const prompt = vi.hoisted(() => ({ hash: "prompt-hash-1" }));

vi.mock("./prompt", async (importOriginal) => {
  const { transcriptSummaryPrompt } = await importOriginal<typeof import("./prompt")>();
  return {
    transcriptSummaryPrompt: {
      ...transcriptSummaryPrompt,
      get hash() {
        return prompt.hash;
      },
    },
  };
});

const cache = vi.hoisted(() => {
  const rows = new Map<string, unknown>();
  return {
    delete: vi.fn((key: string, summary: unknown) => {
      if (rows.get(key) === summary) rows.delete(key);
      return Promise.resolve();
    }),
    read: vi.fn((key: string) => Promise.resolve(rows.get(key))),
    rows,
    write: vi.fn((row: { key: string; summary: unknown }) => {
      if (!rows.has(row.key)) rows.set(row.key, row.summary);
      return Promise.resolve();
    }),
  };
});

vi.mock("./repository", () => ({
  deleteCachedSummary: cache.delete,
  readCachedSummary: cache.read,
  writeCachedSummary: cache.write,
}));

const meta = { invocationId: "11111111-1111-1111-1111-111111111111" };

function fakeInvoker(binding = openai) {
  const invokeStructured = vi
    .fn()
    .mockResolvedValue({ meta, outcome: "SUCCESS", output: summary });
  const invoker = {
    binding: () => binding,
    invokeStructured,
  } as unknown as ResourceAdapterModelInvoker;
  return { invokeStructured, invoker };
}

function summarise(invoker: ResourceAdapterModelInvoker, transcript = "A transcript.") {
  return createCachedTranscriptSummariser(
    invoker,
    "adopting-different-perspectives",
  )(transcript);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  prompt.hash = "prompt-hash-1";
  cache.rows.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("createCachedTranscriptSummariser", () => {
  it("stores a generated summary with its provenance", async () => {
    await expect(summarise(fakeInvoker().invoker)).resolves.toEqual(summary);

    expect(cache.write).toHaveBeenCalledWith({
      ...meta,
      key: expect.stringMatching(/^[0-9a-f]{64}$/),
      lessonSlug: "adopting-different-perspectives",
      model: "gpt-6-luna",
      promptHash: "prompt-hash-1",
      summary,
    });
  });

  it("does not call the model for a transcript it has already summarised", async () => {
    await summarise(fakeInvoker().invoker);
    const later = fakeInvoker();

    await expect(summarise(later.invoker)).resolves.toEqual(summary);

    expect(later.invokeStructured).not.toHaveBeenCalled();
  });

  it("shares a summary across lesson slugs with the same transcript", async () => {
    await summarise(fakeInvoker().invoker);
    const later = fakeInvoker();

    await expect(
      createCachedTranscriptSummariser(
        later.invoker,
        "another-lesson",
      )("A transcript."),
    ).resolves.toEqual(summary);

    expect(later.invokeStructured).not.toHaveBeenCalled();
    expect(cache.rows.size).toBe(1);
  });

  it.each([
    { change: "transcript", transcript: "A different transcript." },
    { change: "model", binding: { ...openai, model: "gpt-5.6-luna" as const } },
    { change: "transport", binding: { ...openai, transport: "deterministic" } },
    { change: "prompt", promptHash: "prompt-hash-2" },
  ])(
    "calls the model when the $change changes",
    async ({ binding, promptHash, transcript }) => {
      await summarise(fakeInvoker().invoker);
      if (promptHash !== undefined) prompt.hash = promptHash;
      const later = fakeInvoker(binding);

      await summarise(later.invoker, transcript);

      expect(later.invokeStructured).toHaveBeenCalledOnce();
      expect(cache.rows.size).toBe(2);
    },
  );

  it("misses when the output schema changes", async () => {
    await summarise(fakeInvoker().invoker);
    onTestFinished(() => {
      vi.doUnmock("./schema");
      vi.resetModules();
    });
    vi.doMock("./schema", async (importOriginal) => {
      const original = await importOriginal<typeof import("./schema")>();
      return {
        ...original,
        transcriptSummarySchema: original.transcriptSummarySchema.safeExtend({
          learningCycles: original.transcriptSummarySchema.shape.learningCycles.max(2),
        }),
      };
    });
    vi.resetModules();
    const { createCachedTranscriptSummariser: changedSummariser } =
      await import("./cache");
    const later = fakeInvoker();

    await changedSummariser(
      later.invoker,
      "adopting-different-perspectives",
    )("A transcript.");

    expect(later.invokeStructured).toHaveBeenCalledOnce();
    expect(cache.rows.size).toBe(2);
  });

  it("repairs an invalid row so the next request can reuse it", async () => {
    await summarise(fakeInvoker().invoker);
    const key = cache.write.mock.calls[0]![0].key;
    const invalid = { learningCycles: [], unassignedTranscriptContent: [] };
    cache.rows.set(key, invalid);
    const { invokeStructured, invoker } = fakeInvoker();

    await expect(summarise(invoker)).resolves.toEqual(summary);

    expect(invokeStructured).toHaveBeenCalledOnce();
    expect(cache.delete).toHaveBeenCalledWith(key, invalid);

    const later = fakeInvoker();
    await expect(summarise(later.invoker)).resolves.toEqual(summary);
    expect(later.invokeStructured).not.toHaveBeenCalled();
    expect(cache.rows.size).toBe(1);
  });

  it("stores nothing when the summariser returns nothing usable", async () => {
    const { invokeStructured, invoker } = fakeInvoker();
    invokeStructured.mockResolvedValueOnce({
      meta,
      outcome: "REFUSAL",
      refusal: "No.",
    });

    await expect(summarise(invoker)).resolves.toBeUndefined();

    expect(cache.write).not.toHaveBeenCalled();
  });

  it.each(["read", "write", "delete"] as const)(
    "still summarises and reports a sanitised error when %s fails",
    async (failing) => {
      if (failing === "delete") {
        await summarise(fakeInvoker().invoker);
        cache.rows.set(cache.write.mock.calls[0]![0].key, {});
      }
      const report = vi.fn();
      setErrorReporter(report);
      const error = new DrizzleQueryError(
        "INSERT INTO private_summary VALUES ($1)",
        ["summary content"],
        Object.assign(new Error("driver details"), { code: "42501" }),
      );
      cache[failing].mockRejectedValueOnce(error);
      const { invokeStructured, invoker } = fakeInvoker();

      await expect(summarise(invoker)).resolves.toEqual(summary);

      expect(invokeStructured).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledExactlyOnceWith(
        new Error(`Transcript summary cache ${failing} failed (code 42501).`),
      );
      const reported = report.mock.calls[0]![0] as Error;
      expect(reported.cause).toBeUndefined();
      expect(console.error).toHaveBeenCalledExactlyOnceWith(reported);
    },
  );
});
