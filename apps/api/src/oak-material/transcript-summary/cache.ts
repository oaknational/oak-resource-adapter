import { createHash } from "node:crypto";
import type { RoleBinding } from "@oaknational/resource-adapter-ai";
import {
  readDatabaseErrorCode,
  type NewTranscriptSummaryCacheRow,
} from "@oaknational/resource-adapter-db";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { z } from "zod";

import type { ResourceAdapterModelInvoker } from "@/ai/model-roles";
import type { SummariseTranscript } from "../material";
import { createTranscriptSummaryGenerator, TRANSCRIPT_SUMMARY_ROLE } from "./invoke";
import { transcriptSummaryPrompt } from "./prompt";
import {
  deleteCachedSummary,
  readCachedSummary,
  writeCachedSummary,
} from "./repository";
import { transcriptSummarySchema, type TranscriptSummary } from "./schema";

const log = raLogger("ai");

function reportCacheError(
  operation: "read" | "write" | "delete",
  error: unknown,
): void {
  const code = readDatabaseErrorCode(error) ?? "unknown";
  log.error(new Error(`Transcript summary cache ${operation} failed (code ${code}).`), {
    report: true,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Refinements are absent from JSON Schema, so a cached row is still re-parsed on read.
const schemaHash = sha256(JSON.stringify(z.toJSONSchema(transcriptSummarySchema)));

function cacheKey(transcript: string, binding: RoleBinding): string {
  return sha256(
    JSON.stringify([
      transcript,
      transcriptSummaryPrompt.hash,
      binding.model,
      binding.transport,
      schemaHash,
    ]),
  );
}

async function readCached(key: string): Promise<TranscriptSummary | undefined> {
  let summary: unknown;
  try {
    summary = await readCachedSummary(key);
  } catch (error) {
    reportCacheError("read", error);
    return undefined;
  }

  if (summary === undefined) {
    return undefined;
  }
  const parsed = transcriptSummarySchema.safeParse(summary);
  if (parsed.success) {
    return parsed.data;
  }

  try {
    await deleteCachedSummary(key, summary);
  } catch (error) {
    reportCacheError("delete", error);
  }
  return undefined;
}

async function writeCached(row: NewTranscriptSummaryCacheRow): Promise<void> {
  try {
    await writeCachedSummary(row);
  } catch (error) {
    reportCacheError("write", error);
  }
}

export function createCachedTranscriptSummariser(
  invoker: ResourceAdapterModelInvoker,
  lessonSlug: string,
): SummariseTranscript {
  const generate = createTranscriptSummaryGenerator(invoker);
  const binding = invoker.binding(TRANSCRIPT_SUMMARY_ROLE);

  return async (transcript) => {
    const key = cacheKey(transcript, binding);
    const cached = await readCached(key);
    if (cached !== undefined) {
      return cached;
    }

    const generated = await generate(transcript);
    if (generated !== undefined) {
      await writeCached({
        invocationId: generated.invocationId,
        key,
        lessonSlug,
        model: binding.model,
        promptHash: transcriptSummaryPrompt.hash,
        summary: generated.summary,
      });
    }
    return generated?.summary;
  };
}
