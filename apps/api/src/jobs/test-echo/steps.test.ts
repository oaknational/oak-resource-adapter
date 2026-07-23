import type { Job } from "@oaknational/resource-adapter-db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getJob } from "../job-repository";
import { executeTestEchoStep } from "./steps";

vi.mock("workflow", () => ({
  FatalError: class FatalError extends Error {
    override readonly name = "FatalError";
  },
}));

vi.mock("../job-repository", () => ({
  getJob: vi.fn(),
}));

const getJobMock = vi.mocked(getJob);

function echoJob(overrides: Partial<Job> = {}): Job {
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
    status: "RUNNING",
    updatedAt: now,
    workflowRunId: "wrun_test",
    ...overrides,
  };
}

describe("executeTestEchoStep", () => {
  beforeEach(() => {
    getJobMock.mockReset();
  });

  it("resolves for a valid test echo job", async () => {
    getJobMock.mockResolvedValue(echoJob());
    await expect(executeTestEchoStep("job-1")).resolves.toBeUndefined();
    expect(getJobMock).toHaveBeenCalledWith("job-1");
  });

  it("fails when the job does not exist", async () => {
    getJobMock.mockResolvedValue(null);
    await expect(executeTestEchoStep("job-1")).rejects.toThrow(
      "does not exist or has the wrong kind",
    );
  });

  it("fails when the job has a different kind", async () => {
    getJobMock.mockResolvedValue(echoJob({ kind: "generate.worksheet" }));
    await expect(executeTestEchoStep("job-1")).rejects.toThrow(
      "does not exist or has the wrong kind",
    );
  });

  it("rejects a job whose input does not match the schema", async () => {
    getJobMock.mockResolvedValue(echoJob({ input: { message: "" } }));
    await expect(executeTestEchoStep("job-1")).rejects.toThrow();
  });
});
