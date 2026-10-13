import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyFixtureRights } from "./verify-original-resource-document-fixture-rights.mjs";

const fixtures = [
  { id: "lesson", oakLesson: { lessonSlug: "lesson", programmeSlug: "programme" } },
];
const worksheet = { type: "worksheet" };
const withWorksheet = { fetch: async () => ({ resources: [worksheet] }) };
const unrestricted = {
  maxRestrictions: [],
  copyrightRestricted: false,
  legacyCopyright: false,
  expired: false,
  geoRestricted: false,
};
for (const maxLevel of [
  "ogl-compatible",
  "ogl-equivalent",
  "restricted",
  "highly-restricted",
]) {
  test(`fixture verification handles ${maxLevel}`, async () => {
    const readRights = async () => ({
      ...unrestricted,
      maxRestrictions: [{ category: "works", maxLevel }],
    });
    if (maxLevel === "ogl-compatible" || maxLevel === "ogl-equivalent") {
      assert.equal(await verifyFixtureRights(fixtures, withWorksheet, readRights), 1);
    } else {
      await assert.rejects(
        verifyFixtureRights(fixtures, withWorksheet, readRights),
        /disallowed rights/,
      );
    }
  });
}
for (const rights of [{ ...unrestricted, copyrightRestricted: true }, null]) {
  test(`fixture verification rejects rights ${JSON.stringify(rights)}`, async () => {
    await assert.rejects(
      verifyFixtureRights(fixtures, withWorksheet, async () => rights),
      /disallowed rights/,
    );
  });
}
test("verification requires a worksheet and propagates unavailable rights", async () => {
  await assert.rejects(
    verifyFixtureRights(
      fixtures,
      { fetch: async () => ({ resources: [] }) },
      async () => unrestricted,
    ),
    /no worksheet/,
  );
  await assert.rejects(
    verifyFixtureRights(fixtures, withWorksheet, async () => {
      throw Error("unavailable");
    }),
    /unavailable/,
  );
});
