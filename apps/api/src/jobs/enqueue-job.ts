import { start } from "workflow/api";
import type { UsageLimitReached } from "@oaknational/resource-adapter-contracts/internal";
import { JobStatus, type Job } from "@oaknational/resource-adapter-db";

import { runJob } from "../../workflows/run-job";
import { createModelJobLimiter, type UsageLimiter } from "../usage/limiter";
import { concurrencyKeySchema, idempotencyKeySchema } from "./domain";
import {
  createOrGetJob,
  failJob,
  findExistingJob,
  recordWorkflowRun,
} from "./job-repository";
import { parseJobInput, type RegisteredJobRequest } from "./registry";

export type EnqueueDependencies = {
  createOrGet: typeof createOrGetJob;
  findExisting: typeof findExistingJob;
  markDispatchFailed: typeof failJob;
  recordRun: typeof recordWorkflowRun;
  startWorkflow: (jobId: string) => Promise<{ runId: string }>;
  usage: UsageLimiter;
};

const defaultDependencies: EnqueueDependencies = {
  createOrGet: createOrGetJob,
  findExisting: findExistingJob,
  markDispatchFailed: failJob,
  recordRun: recordWorkflowRun,
  startWorkflow: (jobId) => start(runJob, [jobId]),
  usage: createModelJobLimiter(),
};

export type EnqueueResult =
  | Readonly<{ outcome: "enqueued"; job: Job }>
  | Readonly<{ outcome: "usageLimitReached"; usageLimit: UsageLimitReached }>;

type EnqueueRequest = RegisteredJobRequest & {
  concurrencyKey?: string | undefined;
  idempotencyKey: string;
};

type JobRequest = Parameters<EnqueueDependencies["findExisting"]>[0];

type Admission =
  Readonly<{ existing: Job | null }> | Readonly<{ usageLimit: UsageLimitReached }>;

/**
 * A model job counts towards its teacher's usage, so the limit is checked only
 * when this request would insert a row. A replay, or a click on work already
 * running, resolves to the existing job and is never refused.
 */
async function admit(
  request: EnqueueRequest,
  jobRequest: JobRequest,
  dependencies: EnqueueDependencies,
): Promise<Admission> {
  const existing = await dependencies.findExisting(jobRequest);
  if (existing !== null || request.teacherId === undefined) {
    return { existing };
  }
  const usage = await dependencies.usage.check(request.teacherId);
  if (usage.allowed) {
    return { existing: null };
  }
  // The request may have been admitted while the usage check was in flight.
  const admitted = await dependencies.findExisting(jobRequest);
  if (admitted !== null) {
    return { existing: admitted };
  }
  console.warn("Usage limit reached", {
    ...("adaptationId" in request.input
      ? { adaptationId: request.input.adaptationId }
      : {}),
    kind: request.kind,
    limitKind: usage.usageLimit.kind,
    retryAt: usage.usageLimit.retryAt,
  });
  return { usageLimit: usage.usageLimit };
}

export async function enqueueJob(
  request: EnqueueRequest,
  dependencies: EnqueueDependencies = defaultDependencies,
): Promise<EnqueueResult> {
  const idempotencyKey = idempotencyKeySchema.parse(request.idempotencyKey);
  const concurrencyKey =
    request.concurrencyKey === undefined
      ? undefined
      : concurrencyKeySchema.parse(request.concurrencyKey);
  const input = parseJobInput(request.kind, request.input);
  const jobRequest = {
    ...(concurrencyKey === undefined ? {} : { concurrencyKey }),
    idempotencyKey,
    input,
    kind: request.kind,
  };

  const admission = await admit(request, jobRequest, dependencies);
  if ("usageLimit" in admission) {
    return { outcome: "usageLimitReached", usageLimit: admission.usageLimit };
  }

  let job = admission.existing;
  let created = false;
  if (job === null) {
    const inserted = await dependencies.createOrGet({
      ...jobRequest,
      countsAgainstClerkUserId: request.teacherId,
    });
    job = inserted.job;
    created = inserted.created;
  }

  const needsDispatch =
    created || (job.status === JobStatus.QUEUED && job.workflowRunId === null);

  if (!needsDispatch) {
    return { job, outcome: "enqueued" };
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

  return { job, outcome: "enqueued" };
}
