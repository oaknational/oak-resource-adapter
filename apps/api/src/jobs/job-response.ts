import type { Job } from "@oaknational/resource-adapter-db";

export function toJobResponse(job: Job) {
  return {
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    failure:
      job.failureCode === null
        ? null
        : {
            code: job.failureCode,
            message: job.failureMessage,
          },
    id: job.id,
    kind: job.kind,
    startedAt: job.startedAt?.toISOString() ?? null,
    status: job.status,
    updatedAt: job.updatedAt.toISOString(),
    workflowRunId: job.workflowRunId,
  };
}
