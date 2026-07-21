import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET as getHealth } from "../app/health/route";
import { POST as getCapabilities } from "../app/v1/capabilities/route";

const lesson = {
  lessonSlug: "adding-fractions",
  programmeSlug: "ks2-maths",
  title: "Adding fractions",
  subjectSlug: "maths",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"],
};

function request(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as NextRequest;
}

describe("API routes", () => {
  it("returns CORS-enabled health status", async () => {
    const response = getHealth(
      request("http://localhost:3001/health", {
        headers: { Origin: "http://localhost:3000" },
      }),
    );

    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
  });

  it("returns the initial capability for valid lesson context", async () => {
    const response = await getCapabilities(
      request("http://localhost:3001/v1/capabilities", {
        body: JSON.stringify({ contractVersion: 1, lesson }),
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      capabilities: [{ id: "worksheetAdapter" }],
    });
  });

  it("rejects an invalid capabilities request", async () => {
    const response = await getCapabilities(
      request("http://localhost:3001/v1/capabilities", {
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
  });
});
