import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyFixtureRights } from "./verify-original-resource-document-fixture-rights.mjs";

const fixtures = [
  { id: "lesson", oakLesson: { lessonSlug: "lesson", programmeSlug: "programme" } },
];
const worksheet = { type: "worksheet" };
for (const maxLevel of [
  "ogl-compatible",
  "ogl-equivalent",
  "restricted",
  "highly-restricted",
]) {
  test(`fixture verification handles ${maxLevel}`, async () => {
    const repository = {
      fetch: async () => ({
        resources: [worksheet],
        maxRestrictions: [{ category: "works", maxLevel }],
      }),
    };
    if (maxLevel === "ogl-compatible" || maxLevel === "ogl-equivalent") {
      assert.equal(await verifyFixtureRights(fixtures, repository), 1);
    } else {
      await assert.rejects(
        verifyFixtureRights(fixtures, repository),
        /disallowed restrictions/,
      );
    }
  });
}
test("verification requires a worksheet and propagates unavailable rights", async () => {
  await assert.rejects(
    verifyFixtureRights(fixtures, {
      fetch: async () => ({ resources: [], maxRestrictions: [] }),
    }),
    /no worksheet/,
  );
  await assert.rejects(
    verifyFixtureRights(fixtures, {
      fetch: async () => {
        throw Error("unavailable");
      },
    }),
    /unavailable/,
  );
});
