import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeTestEchoStep } from "../src/jobs/test-echo/steps";
import { claimJobStep, completeJobStep, failJobStep } from "./job-lifecycle-steps";
import { runJob } from "./run-job";

vi.mock("workflow", () => ({
  FatalError: class FatalError extends Error {
    override readonly name = "FatalError";
  },
  getWorkflowMetadata: () => ({ workflowRunId: "wrun_test" }),
}));

vi.mock("./job-lifecycle-steps", () => ({
  claimJobStep: vi.fn(),
  completeJobStep: vi.fn(),
  failJobStep: vi.fn(),
}));

vi.mock("../src/jobs/test-echo/steps", () => ({
  executeTestEchoStep: vi.fn(),
}));

const claimJobStepMock = vi.mocked(claimJobStep);
const completeJobStepMock = vi.mocked(completeJobStep);
const failJobStepMock = vi.mocked(failJobStep);
const executeTestEchoStepMock = vi.mocked(executeTestEchoStep);

describe("runJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completeJobStepMock.mockResolvedValue(undefined);
    failJobStepMock.mockResolvedValue(undefined);
    executeTestEchoStepMock.mockResolvedValue(undefined);
  });

  it("does nothing when the job could not be claimed", async () => {
    claimJobStepMock.mockResolvedValue({ outcome: "ignored" });

    await runJob("job-1");

    expect(executeTestEchoStepMock).not.toHaveBeenCalled();
    expect(completeJobStepMock).not.toHaveBeenCalled();
    expect(failJobStepMock).not.toHaveBeenCalled();
  });

  it("executes and completes a registered job", async () => {
    claimJobStepMock.mockResolvedValue({ kind: "test.echo", outcome: "claimed" });

    await runJob("job-1");

    expect(executeTestEchoStepMock).toHaveBeenCalledWith("job-1");
    expect(completeJobStepMock).toHaveBeenCalledWith("job-1", "wrun_test");
    expect(failJobStepMock).not.toHaveBeenCalled();
  });

  it("fails a job whose kind has no registered worker", async () => {
    claimJobStepMock.mockResolvedValue({
      kind: "generate.worksheet",
      outcome: "claimed",
    });

    await expect(runJob("job-1")).rejects.toThrow("No background worker is registered");

    expect(failJobStepMock).toHaveBeenCalledWith("job-1", "wrun_test", {
      code: "unsupported_job_kind",
      message: "No background worker is registered for this job kind.",
    });
    expect(completeJobStepMock).not.toHaveBeenCalled();
  });

  it("marks the job failed and rethrows when a step throws", async () => {
    claimJobStepMock.mockResolvedValue({ kind: "test.echo", outcome: "claimed" });
    const stepError = new Error("step blew up");
    executeTestEchoStepMock.mockRejectedValue(stepError);

    await expect(runJob("job-1")).rejects.toBe(stepError);

    expect(failJobStepMock).toHaveBeenCalledWith("job-1", "wrun_test", {
      code: "job_execution_failed",
      message: "The background job failed while executing.",
    });
    expect(completeJobStepMock).not.toHaveBeenCalled();
  });
});
