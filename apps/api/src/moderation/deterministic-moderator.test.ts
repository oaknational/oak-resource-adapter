import { safetyResultOf } from "@oaknational/resource-adapter-moderation";
import { describe, expect, it } from "vitest";

import {
  deterministicModerationTriggers as triggers,
  deterministicModerator,
} from "./deterministic-moderator";

async function safetyOf(content: string) {
  const outcome = await deterministicModerator.moderate({ content });
  return outcome.outcome === "FAILED" ? outcome.reason : safetyResultOf(outcome);
}

describe("deterministicModerator", () => {
  it.each([
    ["Vocabulary you could include:\ncompare", "safe"],
    [`Key words\n${triggers.guidance}`, "guidance-required"],
    [`Glossary (${triggers.highlySensitive})`, "highly-sensitive"],
    [`Sentence starters (${triggers.toxic})`, "toxic"],
    [`Sentence frames (${triggers.failure})`, "UPSTREAM_UNAVAILABLE"],
  ])("moderates %j as %s", async (content, expected) => {
    await expect(safetyOf(content)).resolves.toBe(expected);
  });

  it("reports an aborted request without classifying it", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      deterministicModerator.moderate({
        content: "compare",
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ outcome: "FAILED", reason: "ABORTED" });
  });
});
