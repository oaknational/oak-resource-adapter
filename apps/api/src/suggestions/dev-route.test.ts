import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import type { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getCatalogue } from "../../app/dev/suggestions/catalogue/route";
import { POST as postPreview } from "../../app/dev/suggestions/preview/route";
import { POST as postRun } from "../../app/dev/suggestions/run/route";
import type { ResourceDocument } from "@oaknational/resource-document";

const service = vi.hoisted(() => ({
  catalogue: vi.fn(),
  preview: vi.fn(),
  run: vi.fn(),
}));

vi.mock("./dev-service", () => ({
  getDevSuggestionCatalogue: service.catalogue,
  previewDevSuggestionFlow: service.preview,
  runDevSuggestionFlow: service.run,
  SuggestionRequestError: class SuggestionRequestError extends Error {},
}));

let worksheet: ResourceDocument;

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
    source: "oak",
  });
});

function request(path: string, body?: unknown): NextRequest {
  return new Request(`http://localhost:3001${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    method: body === undefined ? "GET" : "POST",
  }) as NextRequest;
}

function command() {
  return { document: worksheet, flowId: "worksheet-scaffolding" };
}

describe("development suggestion routes", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    service.catalogue.mockReset();
    service.preview.mockReset();
    service.run.mockReset();
  });

  it("hides every route before reading input when dev routes are disabled", async () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "");

    expect(getCatalogue(request("/dev/suggestions/catalogue")).status).toBe(404);
    expect(
      (await postPreview(request("/dev/suggestions/preview", command()))).status,
    ).toBe(404);
    expect((await postRun(request("/dev/suggestions/run", command()))).status).toBe(
      404,
    );
    expect(service.catalogue).not.toHaveBeenCalled();
    expect(service.preview).not.toHaveBeenCalled();
    expect(service.run).not.toHaveBeenCalled();
  });

  it("returns the flow catalogue with CORS headers", async () => {
    service.catalogue.mockReturnValue({ flows: [{ id: "worksheet-scaffolding" }] });

    const response = getCatalogue(request("/dev/suggestions/catalogue"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    await expect(response.json()).resolves.toEqual({
      flows: [{ id: "worksheet-scaffolding" }],
    });
  });

  it("parses and previews a document through the shared service", async () => {
    service.preview.mockResolvedValue({
      candidates: [],
      flow: { id: "worksheet-scaffolding" },
      prompt: { identifier: "suggestions", text: "prompt" },
    });

    const response = await postPreview(request("/dev/suggestions/preview", command()));

    expect(response.status).toBe(200);
    expect(service.preview).toHaveBeenCalledWith({
      appliedTransformations: [],
      document: expect.objectContaining({ schemaVersion: "0.1" }),
      flowId: "worksheet-scaffolding",
    });
  });

  it("rejects an invalid document before calling the service", async () => {
    const response = await postPreview(
      request("/dev/suggestions/preview", { ...command(), document: {} }),
    );

    expect(response.status).toBe(400);
    expect(service.preview).not.toHaveBeenCalled();
  });

  it("returns the synchronous run result", async () => {
    service.run.mockResolvedValue({
      flowId: "worksheet-scaffolding",
      suggestions: [],
    });

    const response = await postRun(request("/dev/suggestions/run", command()));

    expect(response.status).toBe(200);
    expect(service.run).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({
      flowId: "worksheet-scaffolding",
      suggestions: [],
    });
  });
});
