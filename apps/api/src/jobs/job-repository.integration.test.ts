import { randomUUID } from "node:crypto";

import { getDatabaseClient, JobStatus, jobs } from "@oaknational/resource-adapter-db";
import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import {
  claimJob,
  completeJob,
  createOrGetJob,
  failJob,
  getJob,
  IdempotencyConflictError,
  recordWorkflowRun,
} from "./job-repository";

const describeWithDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("job repository integration", () => {
  const createdJobIds: string[] = [];

  afterEach(async () => {
    const ids = createdJobIds.splice(0);

    if (ids.length > 0) {
      await getDatabaseClient().delete(jobs).where(inArray(jobs.id, ids));
    }
  });

  it("deduplicates requests and rejects reuse with different input", async () => {
    const idempotencyKey = `integration-${randomUUID()}`;
    const first = await createOrGetJob({
      idempotencyKey,
      input: { message: "hello" },
      kind: "test.echo",
    });
    createdJobIds.push(first.job.id);

    const duplicate = await createOrGetJob({
      idempotencyKey,
      input: { message: "hello" },
      kind: "test.echo",
    });

    expect(first.created).toBe(true);
    expect(duplicate).toMatchObject({
      created: false,
      job: { id: first.job.id },
    });
    await expect(
      createOrGetJob({
        idempotencyKey,
        input: { message: "different" },
        kind: "test.echo",
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("allows only one workflow run to claim and complete a job", async () => {
    const created = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: { message: "hello" },
      kind: "test.echo",
    });
    createdJobIds.push(created.job.id);

    await expect(claimJob(created.job.id, "wrun_winner")).resolves.toEqual({
      kind: "test.echo",
      outcome: "claimed",
    });
    await expect(claimJob(created.job.id, "wrun_winner")).resolves.toEqual({
      kind: "test.echo",
      outcome: "claimed",
    });
    await expect(claimJob(created.job.id, "wrun_duplicate")).resolves.toEqual({
      outcome: "ignored",
    });

    await completeJob(created.job.id, "wrun_winner");
    await expect(completeJob(created.job.id, "wrun_winner")).resolves.toBeUndefined();

    await expect(getJob(created.job.id)).resolves.toMatchObject({
      status: JobStatus.SUCCEEDED,
      workflowRunId: "wrun_winner",
    });
  });

  it("reads a job by id and returns null when it is absent", async () => {
    const created = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: { message: "hello" },
      kind: "test.echo",
    });
    createdJobIds.push(created.job.id);

    await expect(getJob(created.job.id)).resolves.toMatchObject({
      id: created.job.id,
      status: JobStatus.QUEUED,
    });
    await expect(getJob(randomUUID())).resolves.toBeNull();
  });

  it("records a workflow run only while none is set", async () => {
    const created = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: { message: "hello" },
      kind: "test.echo",
    });
    createdJobIds.push(created.job.id);

    await recordWorkflowRun(created.job.id, "wrun_first");
    await recordWorkflowRun(created.job.id, "wrun_second");

    await expect(getJob(created.job.id)).resolves.toMatchObject({
      workflowRunId: "wrun_first",
    });
  });

  it("marks a queued job as failed with a failure code and message", async () => {
    const created = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: { message: "hello" },
      kind: "test.echo",
    });
    createdJobIds.push(created.job.id);

    await failJob(created.job.id, null, {
      code: "job_execution_failed",
      message: "The background job failed while executing.",
    });

    await expect(getJob(created.job.id)).resolves.toMatchObject({
      failureCode: "job_execution_failed",
      failureMessage: "The background job failed while executing.",
      status: JobStatus.FAILED,
    });
  });

  it("fails a running job for its owning workflow run", async () => {
    const created = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: { message: "hello" },
      kind: "test.echo",
    });
    createdJobIds.push(created.job.id);
    await claimJob(created.job.id, "wrun_owner");

    await failJob(created.job.id, "wrun_owner", {
      code: "job_execution_failed",
      message: "The background job failed while executing.",
    });

    await expect(getJob(created.job.id)).resolves.toMatchObject({
      status: JobStatus.FAILED,
      workflowRunId: "wrun_owner",
    });
  });
});
