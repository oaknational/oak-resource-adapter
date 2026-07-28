import type { Job } from "@oaknational/resource-adapter-db";
import { describe, expect, it } from "vitest";

import { toJobResponse } from "./job-response";

function job(overrides: Partial<Job> = {}): Job {
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
    status: "queued",
    updatedAt: now,
    workflowRunId: null,
    ...overrides,
  };
}

describe("toJobResponse", () => {
  it("serialises timestamps and omits failure for a queued job", () => {
    expect(toJobResponse(job())).toEqual({
      completedAt: null,
      createdAt: "2026-07-23T12:00:00.000Z",
      failure: null,
      id: "bbce8f09-e4a9-46c1-a099-ed346dc5ef4f",
      kind: "test.echo",
      startedAt: null,
      status: "queued",
      updatedAt: "2026-07-23T12:00:00.000Z",
      workflowRunId: null,
    });
  });

  it("serialises optional timestamps once they are set", () => {
    const response = toJobResponse(
      job({
        completedAt: new Date("2026-07-23T12:00:02.000Z"),
        startedAt: new Date("2026-07-23T12:00:01.000Z"),
        status: "succeeded",
        workflowRunId: "wrun_done",
      }),
    );

    expect(response).toMatchObject({
      completedAt: "2026-07-23T12:00:02.000Z",
      startedAt: "2026-07-23T12:00:01.000Z",
      status: "succeeded",
      workflowRunId: "wrun_done",
    });
  });

  it("exposes the failure code and message for a failed job", () => {
    const response = toJobResponse(
      job({
        failureCode: "job_execution_failed",
        failureMessage: "The background job failed while executing.",
        status: "failed",
      }),
    );

    expect(response.failure).toEqual({
      code: "job_execution_failed",
      message: "The background job failed while executing.",
    });
  });
});
