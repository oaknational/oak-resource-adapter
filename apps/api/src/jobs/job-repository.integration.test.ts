import { randomUUID } from "node:crypto";

import { getDatabaseClient, JobStatus } from "@oaknational/resource-adapter-db";
import { afterEach, describe, expect, it } from "vitest";

import {
  claimJob,
  completeJob,
  createOrGetJob,
  IdempotencyConflictError,
} from "./job-repository";

const describeWithDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("job repository integration", () => {
  const createdJobIds: string[] = [];

  afterEach(async () => {
    await getDatabaseClient().job.deleteMany({
      where: { id: { in: createdJobIds.splice(0) } },
    });
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
    await expect(claimJob(created.job.id, "wrun_duplicate")).resolves.toEqual({
      outcome: "ignored",
    });

    await completeJob(created.job.id, "wrun_winner");

    await expect(
      getDatabaseClient().job.findUniqueOrThrow({
        where: { id: created.job.id },
      }),
    ).resolves.toMatchObject({
      status: JobStatus.SUCCEEDED,
      workflowRunId: "wrun_winner",
    });
  });
});
