import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { getMetadata, createReadStream, file, bucket } = vi.hoisted(() => {
  const getMetadata = vi.fn();
  const createReadStream = vi.fn();
  const file = vi.fn(() => ({ getMetadata, createReadStream }));
  const bucket = vi.fn(() => ({ file }));
  return { getMetadata, createReadStream, file, bucket };
});
vi.mock("./client.js", () => ({ getStorage: () => ({ bucket }) }));
import { getArtifactMetadata, isArtifactNotFound, readArtifact } from "./read.js";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", "test-bucket");
});
afterEach(() => vi.unstubAllEnvs());

it("reads metadata without creating a stream", async () => {
  const metadata = { size: "5", generation: "123" };
  getMetadata.mockResolvedValue([metadata]);
  expect(await getArtifactMetadata("preview/example.pdf")).toEqual(metadata);
  expect(file).toHaveBeenCalledWith("preview/example.pdf");
  expect(createReadStream).not.toHaveBeenCalled();
});

it("streams the generation its metadata describes, for the exact key", async () => {
  const stream = Readable.from([Buffer.from("bytes")]);
  const metadata = { size: "5", contentType: "application/pdf", generation: "123" };
  getMetadata.mockResolvedValue([metadata]);
  createReadStream.mockReturnValue(stream);
  expect(await readArtifact("preview/example.pdf")).toEqual({ metadata, stream });
  expect(bucket).toHaveBeenCalledWith("test-bucket");
  expect(file).toHaveBeenNthCalledWith(1, "preview/example.pdf");
  expect(file).toHaveBeenNthCalledWith(2, "preview/example.pdf", {
    generation: "123",
  });
});

it.each([404, 403, 500])(
  "preserves GCS error %s without opening a stream",
  async (code) => {
    const error = Object.assign(new Error("GCS failure"), { code });
    getMetadata.mockRejectedValue(error);
    await expect(readArtifact("preview/key")).rejects.toBe(error);
    expect(createReadStream).not.toHaveBeenCalled();
    expect(isArtifactNotFound(error)).toBe(code === 404);
  },
);

it("requires a configured bucket", async () => {
  vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", "");
  await expect(readArtifact("key")).rejects.toThrow("RESOURCE_ARTIFACTS_BUCKET");
  expect(bucket).not.toHaveBeenCalled();
});
