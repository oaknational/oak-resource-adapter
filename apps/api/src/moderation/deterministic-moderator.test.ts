import { safetyResultOf } from "@oaknational/resource-adapter-moderation";
import { describe, expect, it } from "vitest";

import {
  createDeterministicModerator,
  deterministicModerationResultsSchema,
  type ScaffoldSubject,
} from "./deterministic-moderator";

const moderator = createDeterministicModerator({
  "lesson-one": {
    "scaffold-add-task-glossary": ["highly-sensitive", "safe"],
    "scaffold-add-word-bank": ["guidance-required"],
  },
  "lesson-two": {
    "scaffold-add-sentence-starters": ["toxic"],
    "scaffold-add-sentence-frames": ["failed"],
  },
});

async function resultFor(subject: Partial<ScaffoldSubject>) {
  const outcome = await moderator.moderate({
    content: "compare",
    subject: {
      attemptNumber: 1,
      kind: "scaffold-add-task-glossary",
      lessonSlug: "lesson-one",
      ...subject,
    },
  });
  return outcome.outcome === "FAILED" ? outcome.reason : safetyResultOf(outcome);
}

describe("createDeterministicModerator", () => {
  it.each([
    [{ kind: "scaffold-add-word-bank" }, "guidance-required"],
    [{ kind: "scaffold-add-task-glossary" }, "highly-sensitive"],
    [{ kind: "scaffold-add-sentence-starters", lessonSlug: "lesson-two" }, "toxic"],
    [
      { kind: "scaffold-add-sentence-frames", lessonSlug: "lesson-two" },
      "UPSTREAM_UNAVAILABLE",
    ],
  ])("gives %j its configured result, %s", async (subject, expected) => {
    await expect(resultFor(subject)).resolves.toBe(expected);
  });

  it.each([
    [{ kind: "scaffold-add-prompt-questions" }],
    [{ lessonSlug: "lesson-three" }],
    [{ lessonSlug: null }],
  ])("passes the unlisted %j", async (subject) => {
    await expect(resultFor(subject)).resolves.toBe("safe");
  });

  it("gives each attempt the next result, repeating the last", async () => {
    await expect(resultFor({ attemptNumber: 1 })).resolves.toBe("highly-sensitive");
    await expect(resultFor({ attemptNumber: 2 })).resolves.toBe("safe");
    await expect(resultFor({ attemptNumber: 3 })).resolves.toBe("safe");
  });

  it("reports an aborted request without classifying it", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      moderator.moderate({
        content: "compare",
        signal: controller.signal,
        subject: { attemptNumber: 1, kind: "scaffold-add-word-bank", lessonSlug: null },
      }),
    ).resolves.toMatchObject({ outcome: "FAILED", reason: "ABORTED" });
  });
});

describe("deterministicModerationResultsSchema", () => {
  it.each([
    [{ "lesson-one": { "scaffold-add-word-bank": [] } }],
    [{ "lesson-one": { "scaffold-add-word-bank": ["flagged"] } }],
    [{ "lesson-one": ["safe"] }],
  ])("rejects %j", (value) => {
    expect(deterministicModerationResultsSchema.safeParse(value).success).toBe(false);
  });
});
