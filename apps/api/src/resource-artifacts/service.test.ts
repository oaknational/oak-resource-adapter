import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceArtifact } from "@oaknational/resource-adapter-db";
import type {
  uploadArtifact as upload,
  UploadedArtifact,
} from "@oaknational/resource-adapter-storage";

const { deleteArtifact, getDatabaseClient, insert, returning, uploadArtifact, values } =
  vi.hoisted(() => ({
    deleteArtifact: vi.fn(),
    getDatabaseClient: vi.fn(),
    insert: vi.fn(),
    returning: vi.fn<() => Promise<ResourceArtifact[]>>(),
    uploadArtifact: vi.fn<typeof upload>(),
    values: vi.fn(),
  }));

vi.mock("@oaknational/resource-adapter-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@oaknational/resource-adapter-db")>()),
  getDatabaseClient,
}));

vi.mock("@oaknational/resource-adapter-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@oaknational/resource-adapter-storage")>()),
  deleteArtifact,
  uploadArtifact,
}));

import { resourceArtifacts } from "@oaknational/resource-adapter-db";

import { docxArtifactFormat } from "../exports/formats";
import { storeResourceArtifact } from "./service";

const bytes = Buffer.from("generated resource");
const documentId = "bb3e7399-8f1a-4dc1-835a-73b53c79ca36";
const uploaded: UploadedArtifact = {
  bucket: "test-bucket",
  byteSize: bytes.byteLength,
  crc32c: "AAAAAA==",
  key: "unused-response-key",
  md5Hash: "gcs-provided-md5",
};
const artifact: ResourceArtifact = {
  byteSize: bytes.byteLength,
  checksum: uploaded.md5Hash!,
  createdAt: new Date("2026-09-15T00:00:00Z"),
  ...docxArtifactFormat,
  id: "f65c75b8-c7dc-4f91-96aa-32297b94b4dd",
  resourceDocumentId: documentId,
  storageKey: "local/returned-key",
};

function store(body: Buffer | Uint8Array = bytes) {
  return storeResourceArtifact(
    body,
    documentId,
    docxArtifactFormat.mimeType,
    docxArtifactFormat.format,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  uploadArtifact.mockResolvedValue(uploaded);
  getDatabaseClient.mockReturnValue({ insert });
  insert.mockReturnValue({ values });
  values.mockReturnValue({ returning });
  returning.mockResolvedValue([artifact]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("storeResourceArtifact", () => {
  it("uploads the bytes and returns the inserted artifact", async () => {
    let insertedArtifact: ResourceArtifact;
    returning.mockImplementation(async () => {
      insertedArtifact = {
        ...artifact,
        storageKey: uploadArtifact.mock.calls[0]![0].key,
      };
      return [insertedArtifact];
    });
    const result = await store();
    const key = uploadArtifact.mock.calls[0]![0].key;

    expect(uploadArtifact).toHaveBeenCalledExactlyOnceWith({
      body: bytes,
      contentType: docxArtifactFormat.mimeType,
      key,
    });
    expect(insert).toHaveBeenCalledExactlyOnceWith(resourceArtifacts);
    expect(values).toHaveBeenCalledExactlyOnceWith({
      byteSize: bytes.byteLength,
      checksum: uploaded.md5Hash,
      ...docxArtifactFormat,
      resourceDocumentId: documentId,
      storageKey: key,
    });
    expect(returning).toHaveBeenCalledExactlyOnceWith();
    expect(result).toBe(insertedArtifact!);
  });

  it("does not access the database until the upload has completed", async () => {
    let finishUpload!: (result: UploadedArtifact) => void;
    uploadArtifact.mockReturnValue(
      new Promise((resolve) => {
        finishUpload = resolve;
      }),
    );

    const stored = store();

    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(getDatabaseClient).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();

    finishUpload(uploaded);
    await expect(stored).resolves.toBe(artifact);
    expect(insert).toHaveBeenCalledOnce();
  });

  it("preserves an upload failure without inserting a row or deleting", async () => {
    const error = new Error("Upload failed");
    uploadArtifact.mockRejectedValue(error);

    await expect(store()).rejects.toBe(error);

    expect(getDatabaseClient).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(deleteArtifact).not.toHaveBeenCalled();
  });

  it("preserves an insert failure without deleting or retrying the upload", async () => {
    const error = new Error("Insert failed");
    returning.mockRejectedValue(error);

    await expect(store()).rejects.toBe(error);

    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
    expect(returning).toHaveBeenCalledOnce();
    expect(deleteArtifact).not.toHaveBeenCalled();
  });

  it.each([
    { vercel: undefined, target: undefined, prefix: "local" },
    { vercel: "preview", target: undefined, prefix: "preview" },
    { vercel: "preview", target: "staging", prefix: "staging" },
    { vercel: "production", target: "production", prefix: "production" },
  ])(
    "uses a fresh $prefix-prefixed UUID for each call",
    async ({ vercel, target, prefix }) => {
      vi.stubEnv("VERCEL_ENV", vercel);
      vi.stubEnv("VERCEL_TARGET_ENV", target);

      await store();
      await store();

      const keys = uploadArtifact.mock.calls.map(([input]) => input.key);
      expect(new Set(keys).size).toBe(2);
      for (const key of keys) {
        expect(key).toMatch(
          new RegExp(
            `^${prefix}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
          ),
        );
      }
    },
  );

  it("stores null when GCS supplies no MD5 checksum", async () => {
    uploadArtifact.mockResolvedValue({ ...uploaded, md5Hash: undefined });

    await store();

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ checksum: null }));
  });

  it("takes byte size from the supplied view rather than its backing buffer or GCS", async () => {
    const view = new Uint8Array(32).subarray(5, 12);
    uploadArtifact.mockResolvedValue({ ...uploaded, byteSize: 999 });

    await store(view);

    expect(uploadArtifact.mock.calls[0]![0].body).toBe(view);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ byteSize: 7 }));
  });

  it("persists caller-supplied formats without imposing a DOCX-only restriction", async () => {
    await storeResourceArtifact(bytes, documentId, "application/pdf", "pdf");

    expect(uploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ format: "pdf", mimeType: "application/pdf" }),
    );
  });

  it("rejects an insert that returns no artifact", async () => {
    returning.mockResolvedValue([]);

    await expect(store()).rejects.toThrow(
      "The resource artifact insert returned no row.",
    );
    expect(deleteArtifact).not.toHaveBeenCalled();
  });
});
