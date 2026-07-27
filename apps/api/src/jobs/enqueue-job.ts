import { start } from "workflow/api";
import { JobStatus } from "@oaknational/resource-adapter-db";

import { runJob } from "../../workflows/run-job";
import { idempotencyKeySchema } from "./domain";
import { createOrGetJob, failJob, recordWorkflowRun } from "./job-repository";
import { parseJobInput, type RegisteredJobRequest } from "./registry";

export type EnqueueDependencies = {
  createOrGet: typeof createOrGetJob;
  markDispatchFailed: typeof failJob;
  recordRun: typeof recordWorkflowRun;
  startWorkflow: (jobId: string) => Promise<{ runId: string }>;
};

const defaultDependencies: EnqueueDependencies = {
  createOrGet: createOrGetJob,
  markDispatchFailed: failJob,
  recordRun: recordWorkflowRun,
  startWorkflow: async (jobId) => start(runJob, [jobId]),
};

export async function enqueueJob(
  request: RegisteredJobRequest & { idempotencyKey: string },
  dependencies: EnqueueDependencies = defaultDependencies,
) {
  const idempotencyKey = idempotencyKeySchema.parse(request.idempotencyKey);
  const input = parseJobInput(request.kind, request.input);
  const { created, job } = await dependencies.createOrGet({
    idempotencyKey,
    input,
    kind: request.kind,
  });

  const needsDispatch =
    created || (job.status === JobStatus.QUEUED && job.workflowRunId === null);

  if (!needsDispatch) {
    return job;
  }

  let run: { runId: string };
  try {
    run = await dependencies.startWorkflow(job.id);
  } catch (error) {
    await dependencies.markDispatchFailed(job.id, null, {
      code: "workflow_dispatch_failed",
      message: "The job could not be dispatched to the background worker.",
    });
    throw error;
  }

  // The workflow also records its own run ID while atomically claiming the job.
  // This eager write makes a newly queued job observable before its first step.
  await dependencies.recordRun(job.id, run.runId);

  return job;
}
