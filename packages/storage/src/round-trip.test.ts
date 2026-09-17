import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn();
const download = vi.fn();
const deleteFile = vi.fn();
const fileHandle = {
  delete: deleteFile,
  download,
  metadata: {} as Record<string, unknown>,
  save,
};
const file = vi.fn(() => fileHandle);
const bucket = vi.fn(() => ({ file }));

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket = bucket;
  },
}));

const payload = "resource-adapter storage round trip";

async function importRoundTrip() {
  vi.resetModules();

  return (await import("./round-trip.js")).roundTripArtifactStorage;
}

beforeEach(() => {
  vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", "oak-ow-staging-ldn-ora-artifacts");
  fileHandle.metadata = { crc32c: "AAAAAA==", md5Hash: "1B2M2Y==", size: "34" };
  save.mockResolvedValue(undefined);
  download.mockResolvedValue([Buffer.from(payload)]);
  deleteFile.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("roundTripArtifactStorage", () => {
  it("writes, reads and deletes under the environment's own prefix", async () => {
    const roundTripArtifactStorage = await importRoundTrip();

    const result = await roundTripArtifactStorage("preview");

    expect(result.key).toMatch(/^preview\/_round-trip\//);
    expect(save).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledOnce();
    expect(deleteFile).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      bucket: "oak-ow-staging-ldn-ora-artifacts",
      byteSize: 34,
      crc32c: "AAAAAA==",
      federated: false,
    });
  });

  it("names the credentials it used when an upload fails", async () => {
    save.mockRejectedValue(new Error("Could not load the default credentials."));
    const roundTripArtifactStorage = await importRoundTrip();

    await expect(roundTripArtifactStorage("local")).rejects.toThrowError(
      expect.objectContaining({
        federated: false,
        key: expect.stringMatching(/^local\/_round-trip\//) as string,
        message: expect.stringContaining(
          "Could not load the default credentials.",
        ) as string,
      }),
    );
  });

  it("reports impersonation when a provider is configured", async () => {
    vi.stubEnv("GCP_SERVICE_ACCOUNT", "wif-vercel-ora@oak.iam.gserviceaccount.com");
    vi.stubEnv(
      "GCP_WORKLOAD_IDENTITY_PROVIDER",
      "projects/1/locations/global/workloadIdentityPools/vercel/providers/vercel",
    );
    const roundTripArtifactStorage = await importRoundTrip();

    await expect(roundTripArtifactStorage("staging")).resolves.toMatchObject({
      federated: true,
    });
  });

  it("deletes the object even when the read back fails", async () => {
    download.mockRejectedValue(new Error("403 Forbidden"));
    const roundTripArtifactStorage = await importRoundTrip();

    await expect(roundTripArtifactStorage("local")).rejects.toThrowError(
      "403 Forbidden",
    );
    expect(deleteFile).toHaveBeenCalledOnce();
  });

  it("refuses bytes that came back changed", async () => {
    download.mockResolvedValue([Buffer.from("something else")]);
    const roundTripArtifactStorage = await importRoundTrip();

    await expect(roundTripArtifactStorage("local")).rejects.toThrowError(
      expect.objectContaining({
        key: expect.stringMatching(/^local\/_round-trip\//) as string,
        message: expect.stringContaining("Read back different bytes") as string,
      }),
    );
    expect(deleteFile).toHaveBeenCalledOnce();
  });

  it("retains a cleanup failure without replacing the read failure", async () => {
    const readError = new Error("Read denied");
    const cleanupError = new Error("Delete denied");
    download.mockRejectedValue(readError);
    deleteFile.mockRejectedValue(cleanupError);
    const roundTripArtifactStorage = await importRoundTrip();

    await expect(roundTripArtifactStorage("local")).rejects.toMatchObject({
      name: "ArtifactStorageRoundTripError",
      message: "Read denied",
      cause: readError,
      cleanupError: expect.objectContaining({ cause: cleanupError }),
      cleanupMessage: "Delete denied",
      bucket: "oak-ow-staging-ldn-ora-artifacts",
      federated: false,
      key: expect.stringMatching(/^local\/_round-trip\//),
    });
    expect(deleteFile).toHaveBeenCalledOnce();
  });

  it("retains structured context when only cleanup fails", async () => {
    const cleanupError = new Error("Delete denied");
    deleteFile.mockRejectedValue(cleanupError);
    const roundTripArtifactStorage = await importRoundTrip();

    await expect(roundTripArtifactStorage("preview")).rejects.toMatchObject({
      name: "ArtifactStorageRoundTripError",
      message: "Wrote and read back the object, but cleanup failed.",
      cause: expect.objectContaining({ cause: cleanupError }),
      cleanupError: expect.objectContaining({ cause: cleanupError }),
      cleanupMessage: "Delete denied",
      bucket: "oak-ow-staging-ldn-ora-artifacts",
      federated: false,
      key: expect.stringMatching(/^preview\/_round-trip\//),
    });
    expect(deleteFile).toHaveBeenCalledOnce();
  });
});
