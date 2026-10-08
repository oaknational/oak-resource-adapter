import type { Job } from "@oaknational/resource-adapter-db";
import { describe, expect, it, vi } from "vitest";

import { enqueueJob, type EnqueueDependencies } from "./enqueue-job";
import { ConcurrencyConflictError } from "./job-repository";

function queuedJob(overrides: Partial<Job> = {}): Job {
  const now = new Date("2026-07-23T12:00:00.000Z");
  return {
    completedAt: null,
    concurrencyKey: null,
    countsAgainstClerkUserId: null,
    createdAt: now,
    failureCode: null,
    failureMessage: null,
    id: "bbce8f09-e4a9-46c1-a099-ed346dc5ef4f",
    idempotencyKey: "request-1",
    input: { message: "hello" },
    kind: "test.echo",
    startedAt: null,
    status: "queued",
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
    findExisting: vi.fn().mockResolvedValue(null),
    markDispatchFailed: vi.fn().mockResolvedValue(undefined),
    recordRun: vi.fn().mockResolvedValue(undefined),
    startWorkflow: vi.fn().mockResolvedValue({ runId: "wrun_test" }),
    usage: { check: vi.fn().mockResolvedValue({ allowed: true }) },
    ...overrides,
  };
}

describe("enqueueJob", () => {
  it("persists, dispatches, and records a new workflow run", async () => {
    const deps = dependencies();

    await expect(
      enqueueJob(
        {
          concurrencyKey: "worksheet:adaptation-1:document-1",
          idempotencyKey: "request-1",
          input: { message: " hello " },
          kind: "test.echo",
        },
        deps,
      ),
    ).resolves.toMatchObject({ job: { id: queuedJob().id }, outcome: "enqueued" });

    expect(deps.createOrGet).toHaveBeenCalledWith({
      concurrencyKey: "worksheet:adaptation-1:document-1",
      idempotencyKey: "request-1",
      input: { message: "hello" },
      kind: "test.echo",
    });
    expect(deps.startWorkflow).toHaveBeenCalledWith(queuedJob().id);
    expect(deps.recordRun).toHaveBeenCalledWith(queuedJob().id, "wrun_test");
  });

  it("returns an existing idempotent job without starting another workflow", async () => {
    const deps = dependencies({
      findExisting: vi.fn().mockResolvedValue(
        queuedJob({
          startedAt: new Date("2026-07-23T12:00:01.000Z"),
          status: "running",
          workflowRunId: "wrun_existing",
        }),
      ),
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
      findExisting: vi.fn().mockResolvedValue(queuedJob()),
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

describe("enqueueJob for a job that invokes a model", () => {
  const adaptationId = "0f9a8c3e-6a1d-4b7e-9c2f-3d5e7a9b1c4d";
  const resourceDocumentId = "6b2d4f8a-1c3e-4a5b-8d7f-9e0a2c4b6d8f";
  const usageLimit = {
    kind: "model_jobs_24h",
    retryAt: "2026-07-24T09:00:00.000Z",
  } as const;

  const request = {
    concurrencyKey: `adaptation:${adaptationId}:head:${resourceDocumentId}`,
    idempotencyKey: `suggest:${resourceDocumentId}`,
    input: { adaptationId, flowId: "worksheet-scaffolding", resourceDocumentId },
    kind: "suggestions.generate",
    teacherId: "user_test_teacher",
  } as const;

  const overTheLimit = () => ({
    check: vi.fn().mockResolvedValue({ allowed: false, usageLimit }),
  });

  it("counts a new job against the teacher who asked for it", async () => {
    const deps = dependencies();

    await enqueueJob(request, deps);

    expect(deps.usage.check).toHaveBeenCalledWith("user_test_teacher");
    expect(deps.findExisting).toHaveBeenCalledTimes(1);
    expect(deps.createOrGet).toHaveBeenCalledWith(
      expect.objectContaining({ countsAgainstClerkUserId: "user_test_teacher" }),
    );
  });

  it("refuses a new job over the limit without writing it", async () => {
    const deps = dependencies({ usage: overTheLimit() });

    await expect(enqueueJob(request, deps)).resolves.toEqual({
      outcome: "usageLimitReached",
      usageLimit,
    });
    expect(deps.createOrGet).not.toHaveBeenCalled();
    expect(deps.startWorkflow).not.toHaveBeenCalled();
  });

  it("returns a replayed job over the limit rather than refusing it", async () => {
    const existing = queuedJob({ status: "running", workflowRunId: "wrun_existing" });
    const deps = dependencies({
      findExisting: vi.fn().mockResolvedValue(existing),
      usage: overTheLimit(),
    });

    await expect(enqueueJob(request, deps)).resolves.toEqual({
      job: existing,
      outcome: "enqueued",
    });
    expect(deps.usage.check).not.toHaveBeenCalled();
    expect(deps.createOrGet).not.toHaveBeenCalled();
  });

  it("reports work already running on the head before the limit", async () => {
    const deps = dependencies({
      findExisting: vi
        .fn()
        .mockRejectedValue(new ConcurrencyConflictError("already running")),
      usage: overTheLimit(),
    });

    await expect(enqueueJob(request, deps)).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );
    expect(deps.usage.check).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "resolves a replay admitted during the usage check (already dispatched: %s)",
    async (dispatched) => {
      const existing = queuedJob({
        workflowRunId: dispatched ? "wrun_existing" : null,
      });
      const deps = dependencies({
        findExisting: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(existing),
        usage: overTheLimit(),
      });

      await expect(enqueueJob(request, deps)).resolves.toEqual({
        job: existing,
        outcome: "enqueued",
      });
      expect(deps.createOrGet).not.toHaveBeenCalled();
      expect(deps.startWorkflow).toHaveBeenCalledTimes(dispatched ? 0 : 1);
    },
  );

  it("reports a concurrency conflict that appeared during the usage check", async () => {
    const deps = dependencies({
      findExisting: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValue(new ConcurrencyConflictError("already running")),
      usage: overTheLimit(),
    });

    await expect(enqueueJob(request, deps)).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );
    expect(deps.createOrGet).not.toHaveBeenCalled();
    expect(deps.startWorkflow).not.toHaveBeenCalled();
  });

  it("never checks the limit for a job that invokes no model", async () => {
    const deps = dependencies({ usage: overTheLimit() });

    await expect(
      enqueueJob(
        { idempotencyKey: "request-1", input: { message: "hello" }, kind: "test.echo" },
        deps,
      ),
    ).resolves.toMatchObject({ outcome: "enqueued" });
    expect(deps.usage.check).not.toHaveBeenCalled();
    expect(deps.createOrGet).toHaveBeenCalledWith(
      expect.not.objectContaining({ countsAgainstClerkUserId: expect.anything() }),
    );
  });
});
