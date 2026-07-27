import { FatalError, getWorkflowMetadata } from "workflow";

import { isRegisteredJobKind } from "../src/jobs/registry";
import { testEchoJob } from "../src/jobs/test-echo/definition";
import { executeTestEchoStep } from "../src/jobs/test-echo/steps";
import { claimJobStep, completeJobStep, failJobStep } from "./job-lifecycle-steps";

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
    switch (claimed.kind) {
      case testEchoJob.kind:
        await executeTestEchoStep(jobId);
        break;
    }

    await completeJobStep(jobId, workflowRunId);
  } catch (error) {
    await failJobStep(jobId, workflowRunId, {
      code: "job_execution_failed",
      message: "The background job failed while executing.",
    });
    throw error;
  }
}
