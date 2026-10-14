import { createModerator } from "@oaknational/resource-adapter-moderation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EXPECTED_FLAG_TEXT,
  ModerationNotConfiguredError,
  runModerationSmokeCase,
} from "./dev-service";

vi.mock("@oaknational/resource-adapter-moderation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@oaknational/resource-adapter-moderation")
  >()),
  createModerator: vi.fn(),
}));

const moderate = vi.fn();

beforeEach(() => {
  vi.stubEnv("MODERATION_API_URL", "https://moderation.test");
  moderate.mockReset();
  vi.mocked(createModerator).mockReturnValue({ moderate });
});

describe("runModerationSmokeCase", () => {
  it("sends the flattened linear equations fixture for the expected-pass case", async () => {
    moderate.mockResolvedValue({ outcome: "PASSED", scores: {}, promptVersion: "v1" });

    await expect(runModerationSmokeCase("expected-pass")).resolves.toEqual({
      outcome: "PASSED",
      flaggedCategories: [],
      unrecognisedCategories: [],
      promptVersion: "v1",
      reason: null,
    });

    const [{ content }] = moderate.mock.calls[0] as [{ content: string }];
    expect(content.split("\n")[0]).toBe("Exploring linear equations");
    expect(content.split("\n").length).toBeGreaterThan(1);
  });

  it("sends the committed equipment text for the expected-flag case", async () => {
    moderate.mockResolvedValue({
      outcome: "FLAGGED",
      flaggedCategories: ["p/practical-activities"],
      unrecognisedCategories: ["x/new"],
      scores: {},
      promptVersion: "v1",
    });

    await expect(runModerationSmokeCase("expected-flag")).resolves.toEqual({
      outcome: "FLAGGED",
      flaggedCategories: ["p/practical-activities"],
      unrecognisedCategories: ["x/new"],
      promptVersion: "v1",
      reason: null,
    });
    expect(moderate).toHaveBeenCalledExactlyOnceWith({ content: EXPECTED_FLAG_TEXT });
  });

  it("reports a failed moderation with its reason", async () => {
    moderate.mockResolvedValue({ outcome: "FAILED", reason: "NOT_AUTHENTICATED" });

    await expect(runModerationSmokeCase("expected-flag")).resolves.toEqual({
      outcome: "FAILED",
      flaggedCategories: [],
      unrecognisedCategories: [],
      promptVersion: null,
      reason: "NOT_AUTHENTICATED",
    });
  });

  it("throws a not-configured error when the URL is missing", async () => {
    vi.stubEnv("MODERATION_API_URL", "");

    await expect(runModerationSmokeCase("expected-pass")).rejects.toBeInstanceOf(
      ModerationNotConfiguredError,
    );
    expect(moderate).not.toHaveBeenCalled();
  });
});
