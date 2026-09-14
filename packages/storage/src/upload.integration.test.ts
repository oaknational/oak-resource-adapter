import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { deleteArtifact } from "./delete.js";
import { artifactKey } from "./key.js";
import { uploadArtifact } from "./upload.js";

/**
 * Writes to the real staging bucket with the developer's own credentials, so it
 * is opt-in: `pnpm test:integration --filter=@oaknational/resource-adapter-storage`
 * after `gcloud auth application-default login`.
 */
const describeIntegration =
  process.env.RUN_STORAGE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

// The first authenticated call refreshes a credential before it uploads, which
// lands around 5s and so exceeds vitest's default budget.
const networkTimeout = 30_000;

const written: string[] = [];

function uniqueKey(filename: string): string {
  const key = artifactKey("local", [
    "_integration-test",
    `${Date.now()}-${randomUUID()}`,
    filename,
  ]);
  written.push(key);

  return key;
}

afterAll(async () => {
  await Promise.all(written.map((key) => deleteArtifact(key)));
}, networkTimeout);

describeIntegration("uploadArtifact against the staging bucket", () => {
  it(
    "stores the bytes and reports what GCS recorded",
    { timeout: networkTimeout },
    async () => {
      const body = Buffer.from("integration test artifact");

      const result = await uploadArtifact({
        body,
        contentType: "text/plain",
        key: uniqueKey("artifact.txt"),
      });

      expect(result.byteSize).toBe(body.byteLength);
      expect(result.crc32c).toEqual(expect.any(String));
      expect(result.bucket).toBe(process.env.RESOURCE_ARTIFACTS_BUCKET);
    },
  );

  it(
    "refuses to replace an object already at that key",
    { timeout: networkTimeout },
    async () => {
      const key = uniqueKey("twice.txt");
      const upload = () =>
        uploadArtifact({ body: Buffer.from("first"), contentType: "text/plain", key });

      await upload();

      await expect(upload()).rejects.toThrowError(key);
    },
  );
});
