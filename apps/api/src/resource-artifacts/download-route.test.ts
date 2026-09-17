import { PassThrough, Readable } from "node:stream";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { authenticate, findOwnedArtifact, readArtifact } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  findOwnedArtifact: vi.fn(),
  readArtifact: vi.fn(),
}));
vi.mock("../authentication", () => ({ requestAuthenticator: authenticate }));
vi.mock("./repository", () => ({ findOwnedArtifact }));
vi.mock("@oaknational/resource-adapter-storage", async (original) => ({
  ...(await original<typeof import("@oaknational/resource-adapter-storage")>()),
  readArtifact,
}));
import { downloadArtifact, downloadOptions } from "./download-route";

const id = "11111111-1111-4111-8111-111111111111";
const bytes = Buffer.from("a stored file");
const owned = {
  title: "Exploring linear equations",
  artifact: {
    id,
    resourceDocumentId: id,
    storageKey: "preview/private-key",
    format: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteSize: bytes.length,
    checksum: null,
    createdAt: new Date(),
  },
};
function request(signal?: AbortSignal) {
  return new NextRequest(`http://localhost/resource-artifacts/${id}`, {
    headers: { origin: "http://localhost:3000", authorization: "Bearer test" },
    ...(signal ? { signal } : {}),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESOURCE_ADAPTER_ALLOWED_ORIGINS", "http://localhost:3000");
  authenticate.mockResolvedValue({ teacherId: "owner" });
  findOwnedArtifact.mockResolvedValue(owned);
  readArtifact.mockImplementation(async () => ({
    metadata: { size: String(bytes.length) },
    stream: Readable.from([bytes]),
  }));
});
afterEach(() => vi.unstubAllEnvs());

it("authorises before reading and streams stored bytes with private headers", async () => {
  readArtifact.mockImplementation(async () => {
    expect(findOwnedArtifact).toHaveBeenCalledWith(id, "owner");
    return {
      metadata: { size: String(bytes.length) },
      stream: Readable.from([bytes]),
    };
  });
  const response = await downloadArtifact(request(), id);
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(readArtifact).toHaveBeenCalledWith("preview/private-key");
  expect(response.headers.get("content-type")).toBe(owned.artifact.mimeType);
  expect(response.headers.get("content-length")).toBe(String(bytes.length));
  expect(response.headers.get("content-disposition")).toContain(
    "Exploring-linear-equations.docx",
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("access-control-allow-origin")).toBe(
    "http://localhost:3000",
  );
  expect(response.headers.get("access-control-expose-headers")).toBe(
    "Content-Disposition",
  );
});

it("delivers future formats using the stored format and MIME type", async () => {
  findOwnedArtifact.mockResolvedValue({
    ...owned,
    artifact: { ...owned.artifact, format: "pdf", mimeType: "application/pdf" },
  });
  const response = await downloadArtifact(request(), id);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toContain(".pdf");
  await response.arrayBuffer();
});

it("lengths the response from storage, not the recorded byte size", async () => {
  const stored = Buffer.from("a longer stored file than the row records");
  readArtifact.mockResolvedValue({
    metadata: { size: String(stored.length) },
    stream: Readable.from([stored]),
  });
  const response = await downloadArtifact(request(), id);
  expect(response.headers.get("content-length")).toBe(String(stored.length));
  expect(Buffer.from(await response.arrayBuffer())).toHaveLength(stored.length);
});

it("omits the length rather than sending one storage did not report", async () => {
  readArtifact.mockResolvedValue({
    metadata: {},
    stream: Readable.from([bytes]),
  });
  const response = await downloadArtifact(request(), id);
  expect(response.headers.has("content-length")).toBe(false);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
});

it("requires authentication without querying ownership or storage", async () => {
  authenticate.mockResolvedValue(null);
  expect((await downloadArtifact(request(), id)).status).toBe(401);
  expect(findOwnedArtifact).not.toHaveBeenCalled();
  expect(readArtifact).not.toHaveBeenCalled();
});

it("answers preflight without authentication", () => {
  const response = downloadOptions(request());
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  expect(authenticate).not.toHaveBeenCalled();
});

it("returns identical 404s for absent ownership, invalid IDs and absent objects", async () => {
  findOwnedArtifact.mockResolvedValue(null);
  const missing = await downloadArtifact(request(), id);
  expect(readArtifact).not.toHaveBeenCalled();
  const invalid = await downloadArtifact(request(), "bad-id");
  findOwnedArtifact.mockResolvedValue(owned);
  readArtifact.mockRejectedValue(
    Object.assign(new Error("missing object"), { code: 404 }),
  );
  const orphan = await downloadArtifact(request(), id);
  for (const response of [missing, invalid, orphan]) {
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(response.headers.get("content-length")).toBeNull();
  }
});

it.each([404, 503])(
  "handles opening-stream error %s before sending headers",
  async (code) => {
    readArtifact.mockResolvedValue({
      metadata: { size: String(bytes.length) },
      stream: new Readable({
        read() {
          this.destroy(Object.assign(new Error("read failed"), { code }));
        },
      }),
    });
    const response = await downloadArtifact(request(), id);
    expect(response.status).toBe(code === 404 ? 404 : 500);
    expect(response.headers.has("content-disposition")).toBe(false);
  },
);

it("fails a broken response body after streaming starts", async () => {
  const stream = new PassThrough();
  stream.write(bytes);
  readArtifact.mockResolvedValue({ metadata: { size: "13" }, stream });
  const response = await downloadArtifact(request(), id);
  const reader = response.body!.getReader();
  expect((await reader.read()).value).toEqual(new Uint8Array(bytes));
  stream.destroy(new Error("late storage error"));
  await expect(reader.read()).rejects.toThrow("late storage error");
});

it.each(["body", "request"])("cancels storage on %s cancellation", async (mode) => {
  const stream = new PassThrough();
  stream.write(bytes);
  readArtifact.mockResolvedValue({ metadata: { size: "13" }, stream });
  const controller = new AbortController();
  const response = await downloadArtifact(request(controller.signal), id);
  if (mode === "body") await response.body!.cancel();
  else controller.abort();
  expect(stream.destroyed).toBe(true);
});
