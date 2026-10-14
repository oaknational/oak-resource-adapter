import { describe, expect, it } from "vitest";

import { createModerator, moderationConfigFromEnv } from "./index.js";

/** Live smoke test against the moderation service. Run by hand with `pnpm smoke:moderation`, never from CI. */
const describeWithModeration =
  process.env.RUN_MODERATION_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithModeration("oak moderation service (live)", () => {
  it("passes ordinary maths content", async () => {
    const moderator = createModerator(moderationConfigFromEnv(process.env));

    const outcome = await moderator.moderate({ content: "Solve 2x + 3 = 7 for x." });

    expect(outcome).toMatchObject({ outcome: "PASSED" });
  }, 60_000);

  it("flags routine practical equipment", async () => {
    const moderator = createModerator(moderationConfigFromEnv(process.env));

    const outcome = await moderator.moderate({
      content:
        "In this practical, pupils heat copper sulfate solution over a Bunsen burner, then cut out card shapes with a craft knife.",
    });

    expect(outcome).toMatchObject({ outcome: "FLAGGED" });
  }, 60_000);
});
