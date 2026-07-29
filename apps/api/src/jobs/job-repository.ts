import { isDeepStrictEqual } from "node:util";

import {
  getDatabaseClient,
  JobStatus,
  jobs,
  type Job,
} from "@oaknational/resource-adapter-db";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import type { JobFailure, JobJsonValue } from "./domain";

export class IdempotencyConflictError extends Error {
  override readonly name = "IdempotencyConflictError";
}

export type ClaimedJob = { outcome: "claimed"; kind: string } | { outcome: "ignored" };

function matchesRequest(
  job: Job,
  request: { kind: string; input: JobJsonValue },
): boolean {
  return job.kind === request.kind && isDeepStrictEqual(job.input, request.input);
}

export async function createOrGetJob(request: {
  idempotencyKey: string;
  kind: string;
  input: JobJsonValue;
}): Promise<{ job: Job; created: boolean }> {
  const database = getDatabaseClient();

  // Let PostgreSQL arbitrate the race on the idempotency key. An insert that
  // loses returns no row rather than raising, so the duplicate path is ordinary
  // control flow instead of an exception carrying a driver error code.
  const [created] = await database
    .insert(jobs)
    .values({
      idempotencyKey: request.idempotencyKey,
      input: request.input,
      kind: request.kind,
    })
    .onConflictDoNothing({ target: jobs.idempotencyKey })
    .returning();

  if (created) {
    return { created: true, job: created };
  }

  const [existing] = await database
    .select()
    .from(jobs)
    .where(eq(jobs.idempotencyKey, request.idempotencyKey))
    .limit(1);

  if (!existing) {
    throw new Error(
      `Job with idempotency key ${request.idempotencyKey} was neither inserted nor found.`,
    );
  }

  if (!matchesRequest(existing, request)) {
    throw new IdempotencyConflictError(
      "The idempotency key is already attached to a different job request.",
    );
  }

  return { created: false, job: existing };
}

export async function getJob(id: string): Promise<Job | null> {
  const [job] = await getDatabaseClient()
    .select()
    .from(jobs)
    .where(eq(jobs.id, id))
    .limit(1);

  return job ?? null;
}

export async function recordWorkflowRun(
  jobId: string,
  workflowRunId: string,
): Promise<void> {
  await getDatabaseClient()
    .update(jobs)
    .set({ workflowRunId })
    .where(and(eq(jobs.id, jobId), isNull(jobs.workflowRunId)));
}

export async function claimJob(
  jobId: string,
  workflowRunId: string,
): Promise<ClaimedJob> {
  const database = getDatabaseClient();

  // One atomic statement decides the winner: the run whose UPDATE returns a row
  // holds the job.
  const [claimed] = await database
    .update(jobs)
    .set({
      startedAt: new Date(),
      status: JobStatus.RUNNING,
      workflowRunId,
    })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.status, JobStatus.QUEUED),
        or(isNull(jobs.workflowRunId), eq(jobs.workflowRunId, workflowRunId)),
      ),
    )
    .returning({ kind: jobs.kind });

  if (claimed) {
    return { kind: claimed.kind, outcome: "claimed" };
  }

  // A redelivery of the run that already holds the job must still proceed, so
  // its own claim counts as successful rather than as a duplicate.
  const [job] = await database
    .select({ kind: jobs.kind, status: jobs.status, workflowRunId: jobs.workflowRunId })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (job?.status === JobStatus.RUNNING && job.workflowRunId === workflowRunId) {
    return { kind: job.kind, outcome: "claimed" };
  }

  return { outcome: "ignored" };
}

export async function completeJob(jobId: string, workflowRunId: string): Promise<void> {
  const database = getDatabaseClient();
  const [completed] = await database
    .update(jobs)
    .set({
      completedAt: new Date(),
      failureCode: null,
      failureMessage: null,
      status: JobStatus.SUCCEEDED,
    })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.status, JobStatus.RUNNING),
        eq(jobs.workflowRunId, workflowRunId),
      ),
    )
    .returning({ id: jobs.id });

  if (completed) {
    return;
  }

  // Completing twice is not an error: a redelivered final step finds the job
  // already succeeded under its own run.
  const [job] = await database
    .select({ status: jobs.status, workflowRunId: jobs.workflowRunId })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (job?.status === JobStatus.SUCCEEDED && job.workflowRunId === workflowRunId) {
    return;
  }

  throw new Error(`Job ${jobId} could not be completed from its current state.`);
}

export async function failJob(
  jobId: string,
  workflowRunId: string | null,
  failure: JobFailure,
): Promise<void> {
  await getDatabaseClient()
    .update(jobs)
    .set({
      completedAt: new Date(),
      failureCode: failure.code,
      failureMessage: failure.message,
      status: JobStatus.FAILED,
    })
    .where(
      and(
        eq(jobs.id, jobId),
        inArray(jobs.status, [JobStatus.QUEUED, JobStatus.RUNNING]),
        workflowRunId === null
          ? isNull(jobs.workflowRunId)
          : or(isNull(jobs.workflowRunId), eq(jobs.workflowRunId, workflowRunId)),
      ),
    );
}
