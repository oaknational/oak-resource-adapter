import {
  ArtifactStorageRoundTripError,
  roundTripArtifactStorage,
} from "@oaknational/resource-adapter-storage";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPTIONS, POST } from "../../app/dev/storage/roundtrip/route";

vi.mock("@oaknational/resource-adapter-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@oaknational/resource-adapter-storage")>()),
  roundTripArtifactStorage: vi.fn(),
}));

const roundTrip = vi.mocked(roundTripArtifactStorage);
const result = {
  bucket: "test-artifacts",
  byteSize: 35,
  crc32c: "AAAAAA==",
  federated: true,
  key: "preview/_round-trip/test/probe.txt",
};

function request(method = "POST") {
  return new NextRequest("http://localhost:3001/dev/storage/roundtrip", {
    headers: { Origin: "http://localhost:3000" },
    method,
  });
}

function expectDiagnosticHeaders(response: Response) {
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://localhost:3000",
  );
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}

beforeEach(() => {
  roundTrip.mockReset();
  roundTrip.mockResolvedValue(result);
  vi.stubEnv("ENABLE_DEV_ROUTES", "1");
  vi.stubEnv("RESOURCE_ADAPTER_ALLOWED_ORIGINS", "http://localhost:3000");
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("storage development route", () => {
  it.each([undefined, "", "0", "false", "no"])(
    "does not touch storage when ENABLE_DEV_ROUTES=%s",
    async (value) => {
      vi.stubEnv("ENABLE_DEV_ROUTES", value);

      expect((await POST(request())).status).toBe(404);
      expect(OPTIONS(request("OPTIONS")).status).toBe(404);
      expect(roundTrip).not.toHaveBeenCalled();
    },
  );

  it("answers preflight without touching storage", () => {
    const response = OPTIONS(request("OPTIONS"));

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(roundTrip).not.toHaveBeenCalled();
  });

  it.each([
    { vercel: undefined, target: undefined, environment: "local" },
    { vercel: "preview", target: "preview", environment: "preview" },
    { vercel: "preview", target: "staging", environment: "staging" },
  ])(
    "runs once with the $environment prefix",
    async ({ vercel, target, environment }) => {
      vi.stubEnv("VERCEL_ENV", vercel);
      vi.stubEnv("VERCEL_TARGET_ENV", target);

      const response = await POST(request());

      expect(response.status).toBe(200);
      expectDiagnosticHeaders(response);
      expect(roundTrip).toHaveBeenCalledExactlyOnceWith(environment);
      await expect(response.json()).resolves.toEqual({
        status: "ok",
        environment,
        ...result,
      });
    },
  );

  it.each(["read", "cleanup", "both"])(
    "reports a %s failure with structured context and no error objects",
    async (step) => {
      const cause = new Error(step === "cleanup" ? "Delete denied" : "Read denied");
      const cleanupError = step === "read" ? undefined : new Error("Delete denied");
      roundTrip.mockRejectedValue(
        new ArtifactStorageRoundTripError(
          result.key,
          result.bucket,
          result.federated,
          cause,
          { cleanupError, stage: step === "cleanup" ? "cleanup" : "write-read" },
        ),
      );

      const response = await POST(request());

      expect(response.status).toBe(502);
      expectDiagnosticHeaders(response);
      await expect(response.json()).resolves.toEqual({
        status: "failed",
        environment: "local",
        message:
          step === "cleanup"
            ? "Wrote and read back the object, but cleanup failed."
            : cause.message,
        bucket: result.bucket,
        federated: result.federated,
        key: result.key,
        ...(cleanupError ? { cleanupMessage: "Delete denied" } : {}),
      });
    },
  );

  it.each([
    {
      error: new Error("Storage is not configured."),
      message: "Storage is not configured.",
    },
    { error: "unexpected rejection", message: "Unknown failure." },
  ])("handles failures without storage context", async ({ error, message }) => {
    roundTrip.mockRejectedValue(error);

    const response = await POST(request());

    expect(response.status).toBe(502);
    expectDiagnosticHeaders(response);
    await expect(response.json()).resolves.toEqual({
      status: "failed",
      environment: "local",
      message,
    });
  });
});
