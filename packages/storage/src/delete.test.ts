import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteFile = vi.fn();
const file = vi.fn(() => ({ delete: deleteFile }));
const bucket = vi.fn(() => ({ file }));

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket = bucket;
  },
}));

async function importDeleteArtifact() {
  vi.resetModules();

  return (await import("./delete.js")).deleteArtifact;
}

beforeEach(() => {
  vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", "oak-ow-staging-ldn-ora-artifacts");
  deleteFile.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("deleteArtifact", () => {
  it("removes the object at that key", async () => {
    const deleteArtifact = await importDeleteArtifact();

    await expect(deleteArtifact("local/a/b.txt")).resolves.toBe(true);
    expect(bucket).toHaveBeenCalledWith("oak-ow-staging-ldn-ora-artifacts");
    expect(file).toHaveBeenCalledWith("local/a/b.txt");
  });

  // Callers clean up after themselves, so an absent object is not a failure.
  it("reports an absent object rather than failing", async () => {
    deleteFile.mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 }));
    const deleteArtifact = await importDeleteArtifact();

    await expect(deleteArtifact("local/a/b.txt")).resolves.toBe(false);
  });

  it("preserves any other failure as the cause", async () => {
    const cause = Object.assign(new Error("Forbidden"), { code: 403 });
    deleteFile.mockRejectedValue(cause);
    const deleteArtifact = await importDeleteArtifact();

    await expect(deleteArtifact("local/a/b.txt")).rejects.toThrowError(
      expect.objectContaining({ cause }),
    );
  });

  it("refuses with no bucket configured", async () => {
    vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", "");
    const deleteArtifact = await importDeleteArtifact();

    await expect(deleteArtifact("local/a/b.txt")).rejects.toThrowError(
      "RESOURCE_ARTIFACTS_BUCKET",
    );
  });
});
