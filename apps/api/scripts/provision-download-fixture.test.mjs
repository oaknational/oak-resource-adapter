import { afterEach, beforeEach, expect, it, vi } from "vitest";

const {
  transaction,
  where,
  end,
  getArtifactMetadata,
  uploadArtifact,
  insertDownloadFixture,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  where: vi.fn(),
  end: vi.fn(),
  getArtifactMetadata: vi.fn(),
  uploadArtifact: vi.fn(),
  insertDownloadFixture: vi.fn(),
}));
vi.mock("node:util", async (original) => ({
  ...(await original()),
  parseArgs: () => ({ values: { environment: "local", teacher: "user_test" } }),
}));
vi.mock("@oaknational/resource-adapter-db", async (original) => ({
  ...(await original()),
  createDatabaseClient: () => ({ transaction, $client: { end } }),
  insertDownloadFixture,
}));
vi.mock("@oaknational/resource-adapter-storage", async (original) => ({
  ...(await original()),
  getArtifactMetadata,
  uploadArtifact,
}));

const artifact = { id: "fixture", byteSize: 123, checksum: "checksum" };
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://test:password@localhost:5432/local_dev");
  const query = { from: vi.fn(), innerJoin: vi.fn(), where };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  transaction.mockImplementation((run) =>
    run({
      execute: vi.fn(),
      select: () => query,
    }),
  );
  where.mockResolvedValue([{ teacher: "user_test", artifact }]);
  getArtifactMetadata.mockResolvedValue({ size: "123", md5Hash: "checksum" });
  uploadArtifact.mockResolvedValue({ md5Hash: "uploaded-checksum" });
  insertDownloadFixture.mockResolvedValue(artifact);
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("reuses a fixture whose size and checksum match without writing", async () => {
  await import("./provision-download-fixture.mjs");
  expect(uploadArtifact).not.toHaveBeenCalled();
  expect(insertDownloadFixture).not.toHaveBeenCalled();
  expect(end).toHaveBeenCalledOnce();
});

it.each([
  { size: "124", md5Hash: "checksum" },
  { size: "123", md5Hash: "different" },
])("refuses inconsistent storage metadata: %j", async (metadata) => {
  getArtifactMetadata.mockResolvedValue(metadata);
  await expect(import("./provision-download-fixture.mjs")).rejects.toThrow(
    "does not match",
  );
  expect(uploadArtifact).not.toHaveBeenCalled();
  expect(end).toHaveBeenCalledOnce();
});

it("treats absent storage and database checksums consistently", async () => {
  where.mockResolvedValue([
    { teacher: "user_test", artifact: { ...artifact, checksum: null } },
  ]);
  getArtifactMetadata.mockResolvedValue({ size: "123" });
  await import("./provision-download-fixture.mjs");
  expect(uploadArtifact).not.toHaveBeenCalled();
});

it("refuses to reassign another teacher's fixture", async () => {
  where.mockResolvedValue([{ teacher: "user_other", artifact }]);
  await expect(import("./provision-download-fixture.mjs")).rejects.toThrow(
    "different teacher",
  );
  expect(getArtifactMetadata).not.toHaveBeenCalled();
});

it("provisions a substantial DOCX and records its owner and checksum", async () => {
  where.mockResolvedValue([]);
  await import("./provision-download-fixture.mjs");
  const uploaded = uploadArtifact.mock.calls[0][0];
  expect(uploaded.body.length).toBeGreaterThan(750_000);
  expect(uploaded.body.readUInt32LE(0)).toBe(0x04034b50);
  expect(insertDownloadFixture).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      teacherId: "user_test",
      key: uploaded.key,
      byteSize: uploaded.body.length,
      checksum: "uploaded-checksum",
    }),
  );
});
