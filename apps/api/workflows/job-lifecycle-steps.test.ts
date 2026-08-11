import { beforeEach, describe, expect, it, vi } from "vitest";

import { claimJob, completeJob, failJob } from "@/jobs/job-repository";
import { claimJobStep, completeJobStep, failJobStep } from "./job-lifecycle-steps";

vi.mock("@/jobs/job-repository", () => ({
  claimJob: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
}));

const claimJobMock = vi.mocked(claimJob);
const completeJobMock = vi.mocked(completeJob);
const failJobMock = vi.mocked(failJob);

describe("job lifecycle steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the repository's claim outcome", async () => {
    claimJobMock.mockResolvedValue({ kind: "test.echo", outcome: "claimed" });

    await expect(claimJobStep("job-1", "wrun_test")).resolves.toEqual({
      kind: "test.echo",
      outcome: "claimed",
    });
    expect(claimJobMock).toHaveBeenCalledWith("job-1", "wrun_test");
  });

  it("delegates completion to the repository", async () => {
    completeJobMock.mockResolvedValue(undefined);

    await completeJobStep("job-1", "wrun_test");

    expect(completeJobMock).toHaveBeenCalledWith("job-1", "wrun_test");
  });

  it("validates the failure before recording it", async () => {
    failJobMock.mockResolvedValue(undefined);

    await failJobStep("job-1", "wrun_test", {
      code: "job_execution_failed",
      message: "The background job failed while executing.",
    });

    expect(failJobMock).toHaveBeenCalledWith("job-1", "wrun_test", {
      code: "job_execution_failed",
      message: "The background job failed while executing.",
    });
  });

  it("rejects an invalid failure without touching the repository", async () => {
    await expect(
      failJobStep("job-1", "wrun_test", {
        code: "",
        message: "missing code",
      }),
    ).rejects.toThrow();

    expect(failJobMock).not.toHaveBeenCalled();
  });
});
