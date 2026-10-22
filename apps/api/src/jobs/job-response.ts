import type { Job } from "@oaknational/resource-adapter-db";
import type { JobResponse } from "@oaknational/resource-adapter-dev-api-contracts";

export function toJobResponse(job: Job): JobResponse {
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
