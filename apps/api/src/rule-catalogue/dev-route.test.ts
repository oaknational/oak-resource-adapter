import { CurriculumError } from "@oaknational/resource-adapter-curriculum";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getRules } from "../../app/dev/rules/route";
import { POST as postEvaluation } from "../../app/dev/rules/eligibility/route";
import { evaluateDevEligibility } from "./dev-service";
vi.mock("./dev-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./dev-service")>()),
  evaluateDevEligibility: vi.fn(),
}));

const mockedEvaluateDevEligibility = vi.mocked(evaluateDevEligibility);

const lesson = {
  availableResources: ["worksheet"],
  keyStageSlug: "ks2",
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
  subjectSlug: "english",
  title: "Adopting different perspectives",
};

function request(method: "GET" | "POST", body?: unknown): NextRequest {
  return new Request("http://localhost:3001/dev/rules", {
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    method,
  }) as NextRequest;
}

describe("the development rules routes", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    mockedEvaluateDevEligibility.mockReset();
  });

  it("hides both routes when dev routes are disabled", async () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "");

    expect(getRules(request("GET")).status).toBe(404);
    expect((await postEvaluation(request("POST", { lesson }))).status).toBe(404);
    expect(mockedEvaluateDevEligibility).not.toHaveBeenCalled();
  });

  it("serves the rules with CORS headers", async () => {
    const response = getRules(request("GET"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    await expect(response.json()).resolves.toHaveProperty("lesson");
  });

  it("evaluates a lesson as the teacher described", async () => {
    mockedEvaluateDevEligibility.mockResolvedValue({ capabilities: [], lesson: null });

    const response = await postEvaluation(
      request("POST", { lesson, teacher: { inCopyrightRegion: false } }),
    );

    expect(response.status).toBe(200);
    expect(mockedEvaluateDevEligibility).toHaveBeenCalledWith({
      lesson,
      teacher: { inCopyrightRegion: false },
    });
  });

  it("rejects a request without a usable lesson", async () => {
    const response = await postEvaluation(
      request("POST", { lesson: { lessonSlug: "" } }),
    );

    expect(response.status).toBe(400);
    expect(mockedEvaluateDevEligibility).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const response = await postEvaluation(request("POST", "{ not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The eligibility request is invalid.",
    });
    expect(mockedEvaluateDevEligibility).not.toHaveBeenCalled();
  });

  it("reports Oak being unreachable as a bad gateway", async () => {
    mockedEvaluateDevEligibility.mockRejectedValue(
      new CurriculumError("Oak is down.", { code: "upstream-unavailable" }),
    );

    const response = await postEvaluation(request("POST", { lesson }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "upstream-unavailable",
    });
  });
});
