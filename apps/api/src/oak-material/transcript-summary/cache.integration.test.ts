import { randomUUID } from "node:crypto";
import {
  getDatabaseClient,
  transcriptSummaryCache,
} from "@oaknational/resource-adapter-db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResourceAdapterModelInvoker } from "@/ai/model-roles";
import { createCachedTranscriptSummariser } from "./cache";
import { deleteCachedSummary } from "./repository";

const summary = {
  learningCycles: [],
  unassignedTranscriptContent: ["Perspective changes a story."],
};

function generatedSummary() {
  return {
    meta: { invocationId: randomUUID() },
    outcome: "SUCCESS" as const,
    output: summary,
  };
}

const withDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

withDatabase("transcript summary cache", () => {
  const lessonSlug = `test-${randomUUID()}`;

  function fixture() {
    const invokeStructured = vi.fn(async () => generatedSummary());
    const invoker = {
      binding: () => ({ model: "gpt-6-luna", transport: "openai" }),
      invokeStructured,
    } as unknown as ResourceAdapterModelInvoker;
    const summarise = () =>
      createCachedTranscriptSummariser(
        invoker,
        lessonSlug,
      )(`A transcript for ${lessonSlug}.`);
    return { invokeStructured, summarise };
  }

  function rows() {
    return getDatabaseClient()
      .select()
      .from(transcriptSummaryCache)
      .where(eq(transcriptSummaryCache.lessonSlug, lessonSlug));
  }

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await getDatabaseClient()
      .delete(transcriptSummaryCache)
      .where(eq(transcriptSummaryCache.lessonSlug, lessonSlug));
  });

  it.each(["missing", "invalid"])(
    "handles concurrent misses for a %s row",
    async (state) => {
      const { invokeStructured, summarise } = fixture();
      if (state === "invalid") {
        await summarise();
        await getDatabaseClient()
          .update(transcriptSummaryCache)
          .set({ summary: {} })
          .where(eq(transcriptSummaryCache.lessonSlug, lessonSlug));
        invokeStructured.mockClear();
      }

      const bothInvoked = Promise.withResolvers<void>();
      let arrivals = 0;
      invokeStructured.mockImplementation(async () => {
        arrivals += 1;
        if (arrivals === 2) bothInvoked.resolve();
        await bothInvoked.promise;
        return generatedSummary();
      });

      const results = await Promise.all([summarise(), summarise()]);

      expect(results).toEqual([summary, summary]);
      expect(invokeStructured).toHaveBeenCalledTimes(2);
      expect(await rows()).toEqual([expect.objectContaining({ summary })]);

      await expect(summarise()).resolves.toEqual(summary);
      expect(invokeStructured).toHaveBeenCalledTimes(2);
      expect(console.error).not.toHaveBeenCalled();
    },
  );

  it("does not let a stale invalid-row deletion remove a repaired summary", async () => {
    const { invokeStructured, summarise } = fixture();
    await summarise();
    const invalid = { learningCycles: [], unassignedTranscriptContent: [] };
    await getDatabaseClient()
      .update(transcriptSummaryCache)
      .set({ summary: invalid })
      .where(eq(transcriptSummaryCache.lessonSlug, lessonSlug));
    const [row] = await rows();

    await expect(summarise()).resolves.toEqual(summary);
    await deleteCachedSummary(row!.key, invalid);
    await expect(summarise()).resolves.toEqual(summary);

    expect(invokeStructured).toHaveBeenCalledTimes(2);
    expect(await rows()).toEqual([expect.objectContaining({ summary })]);
    expect(console.error).not.toHaveBeenCalled();
  });
});
