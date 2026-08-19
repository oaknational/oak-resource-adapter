import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import type { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getCatalogue } from "../../app/dev/transformations/catalogue/route";
import { POST as postPreview } from "../../app/dev/transformations/preview/route";
import { POST as postRun } from "../../app/dev/transformations/run/route";
import { TransformationDependencyError, TransformationRequestError } from "./errors";
import type { ResourceDocument } from "@oaknational/resource-document";

const service = vi.hoisted(() => ({
  catalogue: vi.fn(),
  preview: vi.fn(),
  run: vi.fn(),
}));

vi.mock("./dev-service", () => ({
  getDevTransformationCatalogue: service.catalogue,
  previewDevTransformation: service.preview,
  runDevTransformation: service.run,
}));

let worksheet: ResourceDocument;

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
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
  return {
    document: worksheet,
    kind: "scaffold-add-word-bank",
    lesson: {
      lessonSlug: "adopting-different-perspectives",
      programmeSlug: "english-primary-ks2",
    },
    params: { supportLevel: "low" },
    targetBlockId: worksheet.content.find((node) => node.type === "question")?.id,
  };
}

describe("development transformation routes", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    service.catalogue.mockReset();
    service.preview.mockReset();
    service.run.mockReset();
  });

  it("hides every route before reading input when dev routes are disabled", async () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "");

    expect(getCatalogue(request("/dev/transformations/catalogue")).status).toBe(404);
    expect(
      (await postPreview(request("/dev/transformations/preview", command()))).status,
    ).toBe(404);
    expect((await postRun(request("/dev/transformations/run", command()))).status).toBe(
      404,
    );
    expect(service.catalogue).not.toHaveBeenCalled();
    expect(service.preview).not.toHaveBeenCalled();
    expect(service.run).not.toHaveBeenCalled();
  });

  it("returns the registry catalogue with CORS headers", async () => {
    service.catalogue.mockReturnValue({ transformations: [{ kind: "identity" }] });

    const response = getCatalogue(request("/dev/transformations/catalogue"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    await expect(response.json()).resolves.toEqual({
      transformations: [{ kind: "identity" }],
    });
  });

  it("parses and previews a document through the shared service", async () => {
    service.preview.mockResolvedValue({
      execution: "structured-model",
      kind: "scaffold-add-word-bank",
      prompt: { identifier: "scaffold-add-word-bank", text: "prompt", version: 1 },
      status: "active",
      warnings: [],
    });

    const response = await postPreview(
      request("/dev/transformations/preview", command()),
    );

    expect(response.status).toBe(200);
    expect(service.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({ schemaVersion: "0.1" }),
        kind: "scaffold-add-word-bank",
      }),
    );
  });

  it("rejects an invalid document before calling the service", async () => {
    const response = await postPreview(
      request("/dev/transformations/preview", { ...command(), document: {} }),
    );

    expect(response.status).toBe(400);
    expect(service.preview).not.toHaveBeenCalled();
  });

  it("returns request errors as bad requests", async () => {
    service.preview.mockRejectedValue(
      new TransformationRequestError("The target node is invalid."),
    );

    const response = await postPreview(
      request("/dev/transformations/preview", command()),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The target node is invalid.",
    });
  });

  it("returns curriculum dependency failures as bad gateways", async () => {
    service.preview.mockRejectedValue(
      new TransformationDependencyError("Lesson material could not be resolved."),
    );

    const response = await postPreview(
      request("/dev/transformations/preview", command()),
    );

    expect(response.status).toBe(502);
  });

  it("does not report internal failures as bad requests", async () => {
    service.preview.mockRejectedValue(new Error("internal detail"));

    const response = await postPreview(
      request("/dev/transformations/preview", command()),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "The transformation could not be completed.",
    });
  });

  it("returns the synchronous run result", async () => {
    service.run.mockResolvedValue({
      run: { outcome: "APPLIED", outputs: [] },
      warnings: [],
    });

    const response = await postRun(request("/dev/transformations/run", command()));

    expect(response.status).toBe(200);
    expect(service.run).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      run: { outcome: "APPLIED" },
    });
  });
});
