import { describe, expect, it } from "vitest";

import {
  loadOriginalResourceDocumentFixture,
  originalResourceDocumentFixtureManifest,
} from "./fixtures.js";

describe("original resource document fixtures", () => {
  it.each(originalResourceDocumentFixtureManifest)(
    "loads fixture $id",
    async ({ id }) => {
      await expect(loadOriginalResourceDocumentFixture(id)).resolves.toMatchObject({
        manifest: { id },
        markup: expect.stringContaining('markup-version: "0.1"'),
        expectedDocument: { schemaVersion: "0.1" },
      });
    },
  );

  it("rejects a fixture outside the corpus", async () => {
    await expect(loadOriginalResourceDocumentFixture("not-a-fixture")).rejects.toThrow(
      'Unknown original resource document fixture "not-a-fixture".',
    );
  });
});
