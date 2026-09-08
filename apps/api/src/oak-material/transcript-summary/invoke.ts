import type { ResourceAdapterModelInvoker } from "@/ai/model-roles";
import { renderPromptTemplate } from "@oaknational/resource-adapter-ai";
import { raLogger } from "@oaknational/resource-adapter-logger";

import type { SummariseTranscript } from "../material";
import { transcriptSummaryPrompt } from "./prompt";
import { transcriptSummarySchema } from "./schema";

const log = raLogger("ai");

export function createTranscriptSummariser(
  invoker: ResourceAdapterModelInvoker,
): SummariseTranscript {
  return async (transcript) => {
    const result = await invoker.invokeStructured({
      request: {
        input: renderPromptTemplate(transcriptSummaryPrompt, { transcript }),
      },
      role: "lesson-transcript-summary",
      schema: transcriptSummarySchema,
      schemaName: "lesson-transcript-summary",
    });

    if (result.outcome !== "SUCCESS") {
      log.error(`Transcript summary unavailable: Reason ${result.outcome}`, {
        report: true,
      });
      return undefined;
    }

    return result.output;
  };
}
