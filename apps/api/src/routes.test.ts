import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  resourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";

import { GET as getHealth } from "../app/health/route";
import {
  GET as getCapabilities,
  OPTIONS as options,
} from "../app/trpc/v1/[trpc]/route";

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

function capabilitiesRequest(
  input: unknown,
  apiContractVersion: number | null = resourceAdapterApiContractVersion,
): NextRequest {
  return request("http://localhost:3001/trpc/v1/capabilities.get?batch=1", {
    body: JSON.stringify({ "0": input }),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...(apiContractVersion === null
        ? {}
        : {
            [resourceAdapterApiContractVersionHeader]: String(apiContractVersion),
          }),
    },
    method: "POST",
  });
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
    const response = await getCapabilities(capabilitiesRequest(lesson));

    await expect(response.json()).resolves.toMatchObject([
      { result: { data: { capabilities: [{ id: "worksheetAdapter" }] } } },
    ]);
  });

  it("does not offer the worksheet adapter when a worksheet is unavailable", async () => {
    const response = await getCapabilities(
      capabilitiesRequest({ ...lesson, availableResources: ["starter-quiz"] }),
    );

    await expect(response.json()).resolves.toMatchObject([
      { result: { data: { capabilities: [] } } },
    ]);
  });

  it("rejects an unsupported API contract version", async () => {
    const response = await getCapabilities(capabilitiesRequest(lesson, 999));

    expect(response.status).toBe(412);
    await expect(response.json()).resolves.toMatchObject([
      { error: { data: { code: "PRECONDITION_FAILED" } } },
    ]);
  });

  it("returns CORS headers for tRPC preflight requests", () => {
    const response = options(
      request("http://localhost:3001/trpc/v1/capabilities.get", {
        headers: { Origin: "http://localhost:3000" },
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "X-Resource-Adapter-Contract-Version",
    );
  });
});
