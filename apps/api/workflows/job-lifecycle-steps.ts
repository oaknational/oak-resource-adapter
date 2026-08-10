import { jobFailureSchema, type JobFailure } from "@/jobs/domain";
import { claimJob, completeJob, failJob } from "@/jobs/job-repository";

export async function claimJobStep(jobId: string, workflowRunId: string) {
  "use step";

  return claimJob(jobId, workflowRunId);
}

export async function completeJobStep(
  jobId: string,
  workflowRunId: string,
): Promise<void> {
  "use step";

  await completeJob(jobId, workflowRunId);
}

export async function failJobStep(
  jobId: string,
  workflowRunId: string,
  failure: JobFailure,
): Promise<void> {
  "use step";

  await failJob(jobId, workflowRunId, jobFailureSchema.parse(failure));
}
