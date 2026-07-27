import type { Job } from "@oaknational/resource-adapter-db";
import { describe, expect, it, vi } from "vitest";

import { enqueueJob, type EnqueueDependencies } from "./enqueue-job";

function queuedJob(overrides: Partial<Job> = {}): Job {
  const now = new Date("2026-07-23T12:00:00.000Z");
  return {
    completedAt: null,
    createdAt: now,
    failureCode: null,
    failureMessage: null,
    id: "bbce8f09-e4a9-46c1-a099-ed346dc5ef4f",
    idempotencyKey: "request-1",
    input: { message: "hello" },
    kind: "test.echo",
    startedAt: null,
    status: "QUEUED",
    updatedAt: now,
    workflowRunId: null,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<EnqueueDependencies> = {},
): EnqueueDependencies {
  return {
    createOrGet: vi.fn().mockResolvedValue({
      created: true,
      job: queuedJob(),
    }),
    markDispatchFailed: vi.fn().mockResolvedValue(undefined),
    recordRun: vi.fn().mockResolvedValue(undefined),
    startWorkflow: vi.fn().mockResolvedValue({ runId: "wrun_test" }),
    ...overrides,
  };
}

describe("enqueueJob", () => {
  it("persists, dispatches, and records a new workflow run", async () => {
    const deps = dependencies();

    await expect(
      enqueueJob(
        {
          idempotencyKey: "request-1",
          input: { message: " hello " },
          kind: "test.echo",
        },
        deps,
      ),
    ).resolves.toMatchObject({ id: queuedJob().id });

    expect(deps.createOrGet).toHaveBeenCalledWith({
      idempotencyKey: "request-1",
      input: { message: "hello" },
      kind: "test.echo",
    });
    expect(deps.startWorkflow).toHaveBeenCalledWith(queuedJob().id);
    expect(deps.recordRun).toHaveBeenCalledWith(queuedJob().id, "wrun_test");
  });

  it("returns an existing idempotent job without starting another workflow", async () => {
    const deps = dependencies({
      createOrGet: vi.fn().mockResolvedValue({
        created: false,
        job: queuedJob({
          startedAt: new Date("2026-07-23T12:00:01.000Z"),
          status: "RUNNING",
          workflowRunId: "wrun_existing",
        }),
      }),
    });

    await enqueueJob(
      {
        idempotencyKey: "request-1",
        input: { message: "hello" },
        kind: "test.echo",
      },
      deps,
    );

    expect(deps.startWorkflow).not.toHaveBeenCalled();
  });

  it("redelivers an existing job left queued before dispatch", async () => {
    const deps = dependencies({
      createOrGet: vi.fn().mockResolvedValue({
        created: false,
        job: queuedJob(),
      }),
    });

    await enqueueJob(
      {
        idempotencyKey: "request-1",
        input: { message: "hello" },
        kind: "test.echo",
      },
      deps,
    );

    expect(deps.startWorkflow).toHaveBeenCalledWith(queuedJob().id);
  });

  it("marks a job failed when workflow dispatch is rejected", async () => {
    const dispatchError = new Error("queue unavailable");
    const deps = dependencies({
      startWorkflow: vi.fn().mockRejectedValue(dispatchError),
    });

    await expect(
      enqueueJob(
        {
          idempotencyKey: "request-1",
          input: { message: "hello" },
          kind: "test.echo",
        },
        deps,
      ),
    ).rejects.toBe(dispatchError);

    expect(deps.markDispatchFailed).toHaveBeenCalledWith(queuedJob().id, null, {
      code: "workflow_dispatch_failed",
      message: "The job could not be dispatched to the background worker.",
    });
  });

  it("rejects invalid input before writing a job", async () => {
    const deps = dependencies();

    await expect(
      enqueueJob(
        {
          idempotencyKey: "request-1",
          input: { message: "" },
          kind: "test.echo",
        },
        deps,
      ),
    ).rejects.toThrow();

    expect(deps.createOrGet).not.toHaveBeenCalled();
  });
});
