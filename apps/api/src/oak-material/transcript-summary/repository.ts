import {
  getDatabaseClient,
  transcriptSummaryCache,
  type NewTranscriptSummaryCacheRow,
} from "@oaknational/resource-adapter-db";
import { and, eq } from "drizzle-orm";

export async function readCachedSummary(key: string): Promise<unknown> {
  const [row] = await getDatabaseClient()
    .select({ summary: transcriptSummaryCache.summary })
    .from(transcriptSummaryCache)
    .where(eq(transcriptSummaryCache.key, key))
    .limit(1);

  return row?.summary;
}

export async function deleteCachedSummary(
  key: string,
  summary: unknown,
): Promise<void> {
  // A concurrent repair must not be deleted along with the rejected value.
  await getDatabaseClient()
    .delete(transcriptSummaryCache)
    .where(
      and(
        eq(transcriptSummaryCache.key, key),
        eq(transcriptSummaryCache.summary, summary),
      ),
    );
}

export async function writeCachedSummary(
  row: NewTranscriptSummaryCacheRow,
): Promise<void> {
  await getDatabaseClient()
    .insert(transcriptSummaryCache)
    .values(row)
    .onConflictDoNothing({ target: transcriptSummaryCache.key });
}
