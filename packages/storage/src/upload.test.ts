import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UploadedArtifact } from "./upload.js";

const save = vi.fn();
const fileHandle: { metadata: Record<string, unknown>; save: typeof save } = {
  metadata: {},
  save,
};
const file = vi.fn(() => fileHandle);
const bucket = vi.fn(() => ({ file }));
const storageOptions: unknown[] = [];

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket = bucket;

    constructor(options?: unknown) {
      storageOptions.push(options);
    }
  },
}));

vi.mock("google-auth-library", () => ({
  ExternalAccountClient: { fromJSON: vi.fn(() => ({ federated: true })) },
}));

const federatedEnv = {
  GCP_SERVICE_ACCOUNT: "wif-vercel-ora@oak.iam.gserviceaccount.com",
  GCP_WORKLOAD_IDENTITY_PROVIDER:
    "projects/1/locations/global/workloadIdentityPools/vercel/providers/vercel",
};

/** Fresh module per test, because the Storage client is cached across calls. */
async function importUploadArtifact() {
  vi.resetModules();

  return (await import("./upload.js")).uploadArtifact;
}

function upload(overrides: { key?: string } = {}) {
  return {
    body: Buffer.from("worksheet bytes"),
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    key: "staging/resource-documents/abc/worksheet.docx",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", "oak-ow-staging-ldn-ora-artifacts");
  fileHandle.metadata = { crc32c: "AAAAAA==", md5Hash: "1B2M2Y8A==", size: "15" };
  save.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  storageOptions.length = 0;
});

describe("uploadArtifact", () => {
  it("writes the bytes to the configured bucket under the given key", async () => {
    const uploadArtifact = await importUploadArtifact();

    await uploadArtifact(upload());

    expect(bucket).toHaveBeenCalledWith("oak-ow-staging-ldn-ora-artifacts");
    expect(file).toHaveBeenCalledWith("staging/resource-documents/abc/worksheet.docx");
    expect(save).toHaveBeenCalledWith(Buffer.from("worksheet bytes"), {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      preconditionOpts: { ifGenerationMatch: 0 },
      resumable: false,
    });
  });

  it("resolves with what GCS recorded, so a caller need not read the object back", async () => {
    const uploadArtifact = await importUploadArtifact();

    await expect(uploadArtifact(upload())).resolves.toEqual({
      bucket: "oak-ow-staging-ldn-ora-artifacts",
      byteSize: 15,
      crc32c: "AAAAAA==",
      key: "staging/resource-documents/abc/worksheet.docx",
      md5Hash: "1B2M2Y8A==",
    } satisfies UploadedArtifact);
  });

  it("reports a missing md5 rather than failing, since GCS omits it for some objects", async () => {
    fileHandle.metadata = { crc32c: "AAAAAA==", size: 15 };
    const uploadArtifact = await importUploadArtifact();

    await expect(uploadArtifact(upload())).resolves.toMatchObject({
      crc32c: "AAAAAA==",
      md5Hash: undefined,
    });
  });

  it("preserves the underlying failure as the cause", async () => {
    const cause = new Error("412 Precondition Failed");
    save.mockRejectedValue(cause);
    const uploadArtifact = await importUploadArtifact();

    await expect(uploadArtifact(upload())).rejects.toThrowError(
      expect.objectContaining({
        cause,
        message: expect.stringContaining("worksheet.docx") as string,
      }),
    );
  });

  it("refuses an upload with no bucket configured", async () => {
    vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", "");
    const uploadArtifact = await importUploadArtifact();

    await expect(uploadArtifact(upload())).rejects.toThrowError(
      "RESOURCE_ARTIFACTS_BUCKET",
    );
  });

  it("refuses to report an upload GCS did not checksum", async () => {
    fileHandle.metadata = { size: "15" };
    const uploadArtifact = await importUploadArtifact();

    await expect(uploadArtifact(upload())).rejects.toThrowError("no checksum or size");
  });

  it("falls back to application default credentials when no provider is set", async () => {
    const uploadArtifact = await importUploadArtifact();

    await uploadArtifact(upload());

    expect(storageOptions).toEqual([undefined]);
  });

  it("impersonates the service account when a provider is set", async () => {
    vi.stubEnv("GCP_SERVICE_ACCOUNT", federatedEnv.GCP_SERVICE_ACCOUNT);
    vi.stubEnv(
      "GCP_WORKLOAD_IDENTITY_PROVIDER",
      federatedEnv.GCP_WORKLOAD_IDENTITY_PROVIDER,
    );
    const uploadArtifact = await importUploadArtifact();

    await uploadArtifact(upload());

    expect(storageOptions).toEqual([{ authClient: { federated: true } }]);
  });

  it("builds one Storage client across uploads, so the token exchange is not repeated", async () => {
    const uploadArtifact = await importUploadArtifact();

    await uploadArtifact(upload());
    await uploadArtifact(upload({ key: "staging/resource-documents/abc/slides.pptx" }));

    expect(storageOptions).toHaveLength(1);
  });
});
