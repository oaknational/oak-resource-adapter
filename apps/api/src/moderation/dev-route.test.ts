import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OPTIONS as moderationOptions,
  POST as postModeration,
} from "../../app/dev/moderation/moderate/route";
import { ModerationNotConfiguredError, runModerationSmokeCase } from "./dev-service";

vi.mock("./dev-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./dev-service")>()),
  runModerationSmokeCase: vi.fn(),
}));

const mockedRun = vi.mocked(runModerationSmokeCase);

function request(body?: string): NextRequest {
  return new Request("http://localhost:3001/dev/moderation/moderate", {
    ...(body === undefined ? {} : { body }),
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    method: body === undefined ? "OPTIONS" : "POST",
  }) as NextRequest;
}

describe("the development moderation route", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    mockedRun.mockReset();
  });

  it("hides the route before reading input when dev routes are disabled", async () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "");

    expect(moderationOptions(request()).status).toBe(404);
    expect(
      (await postModeration(request(JSON.stringify({ case: "expected-pass" })))).status,
    ).toBe(404);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it("answers the preflight with CORS headers", () => {
    const response = moderationOptions(request());

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
  });

  it("returns the smoke result uncached with CORS headers", async () => {
    mockedRun.mockResolvedValue({
      outcome: "FLAGGED",
      flaggedCategories: ["p/practical-activities"],
      unrecognisedCategories: [],
      promptVersion: "v1.2.3",
      reason: null,
    });

    const response = await postModeration(
      request(JSON.stringify({ case: "expected-flag" })),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      outcome: "FLAGGED",
      flaggedCategories: ["p/practical-activities"],
      unrecognisedCategories: [],
      promptVersion: "v1.2.3",
      reason: null,
    });
    expect(mockedRun).toHaveBeenCalledExactlyOnceWith("expected-flag");
  });

  it.each([
    ["an unknown case", JSON.stringify({ case: "anything" })],
    ["free text", JSON.stringify({ content: "Some text to moderate" })],
    ["extra fields", JSON.stringify({ case: "expected-pass", content: "Some text" })],
    ["a body that is not JSON", "not json"],
  ])("rejects %s", async (_name, body) => {
    const response = await postModeration(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The moderation smoke request is invalid.",
    });
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it("answers 503 when the moderation service is not configured", async () => {
    mockedRun.mockRejectedValue(new ModerationNotConfiguredError("Not configured."));

    const response = await postModeration(
      request(JSON.stringify({ case: "expected-pass" })),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "MODERATION_API_URL is not configured.",
    });
  });
});
