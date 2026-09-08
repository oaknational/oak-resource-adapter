import { loadOriginalResourceDocumentFixture } from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import { strFromU8, unzipSync } from "fflate";
import type { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";

import { POST } from "../../app/dev/exports/docx/route";

// dev-route.test.ts covers the route's contract with the converter mocked; this
// runs the real one, so the two cannot share a file.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("returns a real worksheet DOCX through the route without network access", async () => {
  vi.stubEnv("ENABLE_DEV_ROUTES", "true");
  const network = vi.fn(() => {
    throw new Error("Unexpected network call");
  });
  vi.stubGlobal("fetch", network);
  const { expectedDocument: document } = await loadOriginalResourceDocumentFixture(
    "linear-equations-smoke",
  );
  const response = await POST(
    new Request("http://localhost/dev/exports/docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document, embedFigures: false }),
    }) as NextRequest,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain(
    "Exploring-linear-equations.docx",
  );
  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const body = strFromU8(entries["word/document.xml"]!);
  expect(body).toContain("Question 1 (2 marks)");
  expect(body).toContain('w:pStyle w:val="Heading1"');
  expect(network).not.toHaveBeenCalled();
});
