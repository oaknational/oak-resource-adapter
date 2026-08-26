import { FatalError, getWorkflowMetadata } from "workflow";

import { isRegisteredJobKind, type RegisteredJobKind } from "@/jobs/registry";
import { testEchoJob } from "@/jobs/test-echo/definition";
import { executeTestEchoStep } from "@/jobs/test-echo/steps";
import { applySuggestionJob } from "@/jobs/suggestions/apply-definition";
import { generateSuggestionsJob } from "@/jobs/suggestions/generate-definition";
import {
  executeApplySuggestionStep,
  executeGenerateSuggestionsStep,
} from "@/jobs/suggestions/steps";
import { claimJobStep, completeJobStep, failJobStep } from "./job-lifecycle-steps";

const jobExecutors = {
  [applySuggestionJob.kind]: executeApplySuggestionStep,
  [generateSuggestionsJob.kind]: executeGenerateSuggestionsStep,
  [testEchoJob.kind]: executeTestEchoStep,
} satisfies Record<RegisteredJobKind, (jobId: string) => Promise<void>>;

export async function runJob(jobId: string): Promise<void> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const claimed = await claimJobStep(jobId, workflowRunId);

  if (claimed.outcome === "ignored") {
    return;
  }

  if (!isRegisteredJobKind(claimed.kind)) {
    await failJobStep(jobId, workflowRunId, {
      code: "unsupported_job_kind",
      message: "No background worker is registered for this job kind.",
    });
    throw new FatalError("No background worker is registered for this job kind.");
  }

  try {
    await jobExecutors[claimed.kind](jobId);

    await completeJobStep(jobId, workflowRunId);
  } catch (error) {
    await failJobStep(jobId, workflowRunId, {
      code: "job_execution_failed",
      message: "The background job failed while executing.",
    });
    throw error;
  }
}
