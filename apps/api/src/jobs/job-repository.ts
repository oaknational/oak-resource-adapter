import { isDeepStrictEqual } from "node:util";

import {
  getDatabaseClient,
  JobStatus,
  Prisma,
  type Job,
} from "@oaknational/resource-adapter-db";

import type { JobFailure, JobJsonValue } from "./domain";

export class IdempotencyConflictError extends Error {
  override readonly name = "IdempotencyConflictError";
}

export type ClaimedJob = { outcome: "claimed"; kind: string } | { outcome: "ignored" };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function toPrismaJson(
  value: JobJsonValue,
): Prisma.JsonNullValueInput | Prisma.InputJsonValue {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

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

  try {
    const job = await database.job.create({
      data: {
        idempotencyKey: request.idempotencyKey,
        input: toPrismaJson(request.input),
        kind: request.kind,
      },
    });
    return { created: true, job };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }

  const job = await database.job.findUniqueOrThrow({
    where: { idempotencyKey: request.idempotencyKey },
  });

  if (!matchesRequest(job, request)) {
    throw new IdempotencyConflictError(
      "The idempotency key is already attached to a different job request.",
    );
  }

  return { created: false, job };
}

export async function getJob(id: string): Promise<Job | null> {
  return getDatabaseClient().job.findUnique({ where: { id } });
}

export async function recordWorkflowRun(
  jobId: string,
  workflowRunId: string,
): Promise<void> {
  await getDatabaseClient().job.updateMany({
    data: { workflowRunId },
    where: {
      id: jobId,
      workflowRunId: null,
    },
  });
}

export async function claimJob(
  jobId: string,
  workflowRunId: string,
): Promise<ClaimedJob> {
  const database = getDatabaseClient();
  const claimed = await database.job.updateMany({
    data: {
      startedAt: new Date(),
      status: JobStatus.RUNNING,
      workflowRunId,
    },
    where: {
      id: jobId,
      status: JobStatus.QUEUED,
      OR: [{ workflowRunId: null }, { workflowRunId }],
    },
  });

  const job = await database.job.findUnique({ where: { id: jobId } });

  if (
    (claimed.count === 1 ||
      (job?.status === JobStatus.RUNNING && job.workflowRunId === workflowRunId)) &&
    job
  ) {
    return { kind: job.kind, outcome: "claimed" };
  }

  return { outcome: "ignored" };
}

export async function completeJob(jobId: string, workflowRunId: string): Promise<void> {
  const database = getDatabaseClient();
  const completed = await database.job.updateMany({
    data: {
      completedAt: new Date(),
      failureCode: null,
      failureMessage: null,
      status: JobStatus.SUCCEEDED,
    },
    where: {
      id: jobId,
      status: JobStatus.RUNNING,
      workflowRunId,
    },
  });

  if (completed.count === 1) {
    return;
  }

  const job = await database.job.findUnique({ where: { id: jobId } });
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
  const database = getDatabaseClient();
  await database.job.updateMany({
    data: {
      completedAt: new Date(),
      failureCode: failure.code,
      failureMessage: failure.message,
      status: JobStatus.FAILED,
    },
    where: {
      id: jobId,
      status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
      ...(workflowRunId === null
        ? { workflowRunId: null }
        : { OR: [{ workflowRunId: null }, { workflowRunId }] }),
    },
  });
}
