import { spawnSync } from "node:child_process";
import {
  createDatabaseClient,
  downloadFixtureMimeType,
  seedDownloadFixture,
} from "@oaknational/resource-adapter-db";
import { getArtifactMetadata } from "@oaknational/resource-adapter-storage";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seedLocalDatabase } from "./seed-download-fixture.mjs";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
vi.mock("@oaknational/resource-adapter-db", async (original) => ({
  ...(await original()),
  createDatabaseClient: vi.fn(),
  seedDownloadFixture: vi.fn(),
}));
vi.mock("@oaknational/resource-adapter-storage", () => ({
  getArtifactMetadata: vi.fn(),
}));

beforeEach(() => {
  for (const [name, value] of Object.entries({
    DATABASE_URL: "postgresql://test:password@localhost:5432/local_dev",
    RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID: "3d0f5051-e6e9-4b27-b9bb-fd011b76370f",
    E2E_CLERK_USER_EMAIL: "test@example.test",
    CLERK_SECRET_KEY: "test-key",
    VERCEL: "",
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: "",
    DATABASE_CA_CERT: "",
  }))
    vi.stubEnv(name, value);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json([{ id: "user_test" }])),
  );
  vi.mocked(getArtifactMetadata).mockResolvedValue({
    size: "123",
    contentType: downloadFixtureMimeType,
    md5Hash: "checksum",
  });
  vi.mocked(spawnSync).mockReturnValue({ status: 0 });
  vi.mocked(createDatabaseClient).mockReturnValue({ $client: { end: vi.fn() } });
  vi.mocked(seedDownloadFixture).mockResolvedValue({
    id: process.env.RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID,
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("checks fixture access, resets and migrates, then seeds", async () => {
  await seedLocalDatabase({ reset: true });
  expect(spawnSync).toHaveBeenCalledWith(
    "pnpm",
    ["db:reset"],
    expect.objectContaining({ stdio: "inherit" }),
  );
  expect(getArtifactMetadata.mock.invocationCallOrder[0]).toBeLessThan(
    spawnSync.mock.invocationCallOrder[0],
  );
  expect(spawnSync.mock.invocationCallOrder[0]).toBeLessThan(
    seedDownloadFixture.mock.invocationCallOrder[0],
  );
});
it("does not seed when reset fails", async () => {
  vi.mocked(spawnSync).mockReturnValue({ status: 1 });
  await expect(seedLocalDatabase({ reset: true })).rejects.toThrow("reset failed");
  expect(createDatabaseClient).not.toHaveBeenCalled();
});
it("does not reset when the shared fixture is inaccessible", async () => {
  vi.mocked(getArtifactMetadata).mockRejectedValueOnce(new Error("missing fixture"));
  await expect(seedLocalDatabase({ reset: true })).rejects.toThrow("missing fixture");
  expect(spawnSync).not.toHaveBeenCalled();
});
it("does not reset a deployed database reached through the proxy", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:password@localhost:5433/ora");
  await expect(seedLocalDatabase({ reset: true })).rejects.toThrow(
    "only supports the local",
  );
  expect(spawnSync).not.toHaveBeenCalled();
});
it("leaves existing data intact during a normal seed", async () => {
  await seedLocalDatabase();
  expect(spawnSync).not.toHaveBeenCalled();
  expect(seedDownloadFixture).toHaveBeenCalledOnce();
});
