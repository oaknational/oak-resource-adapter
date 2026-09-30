import type { ResourceAdapterModelInvoker } from "@/ai/model-roles";
import { renderPromptTemplate } from "@oaknational/resource-adapter-ai";
import { raLogger } from "@oaknational/resource-adapter-logger";

import type { SummariseTranscript } from "../material";
import { transcriptSummaryPrompt } from "./prompt";
import { transcriptSummarySchema, type TranscriptSummary } from "./schema";

const log = raLogger("ai");

export function summariseTranscriptOnce(
  summarise: SummariseTranscript,
): SummariseTranscript {
  const pending = new Map<string, ReturnType<SummariseTranscript>>();

  return (transcript) => {
    const started = pending.get(transcript) ?? summarise(transcript);
    pending.set(transcript, started);
    return started;
  };
}

export const TRANSCRIPT_SUMMARY_ROLE = "lesson-transcript-summary";

type GeneratedTranscriptSummary = Readonly<{
  invocationId: string;
  summary: TranscriptSummary;
}>;

export function createTranscriptSummaryGenerator(
  invoker: ResourceAdapterModelInvoker,
): (transcript: string) => Promise<GeneratedTranscriptSummary | undefined> {
  return async (transcript) => {
    const result = await invoker.invokeStructured({
      request: {
        input: renderPromptTemplate(transcriptSummaryPrompt, { transcript }),
      },
      role: TRANSCRIPT_SUMMARY_ROLE,
      schema: transcriptSummarySchema,
      schemaName: "lesson-transcript-summary",
    });

    if (result.outcome !== "SUCCESS") {
      log.error(
        `Transcript summary unavailable: Reason ${result.outcome}, Details: ${JSON.stringify(result.meta)}`,
        {
          report: true,
        },
      );
      return undefined;
    }

    return { invocationId: result.meta.invocationId, summary: result.output };
  };
}

export function createTranscriptSummariser(
  invoker: ResourceAdapterModelInvoker,
): SummariseTranscript {
  const generate = createTranscriptSummaryGenerator(invoker);
  return async (transcript) => (await generate(transcript))?.summary;
}
