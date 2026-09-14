import { loadOriginalResourceDocumentFixture } from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { exportDocx } from "./export-api";
import type { ResourceDocument } from "@oaknational/resource-document";

let document: ResourceDocument;

beforeAll(async () => {
  document = (await loadOriginalResourceDocumentFixture("linear-equations-smoke"))
    .expectedDocument;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("DOCX harness API", () => {
  it.each([true, false])(
    "posts the parsed synthetic fixture with embedFigures=%s and reads binary",
    async (embedFigures) => {
      const bytes = new Uint8Array([80, 75, 3, 4, 0, 255]);
      respond(new Response(bytes));
      const controller = new AbortController();

      const result = await exportDocx({ document, embedFigures }, controller.signal);

      expect(fetch).toHaveBeenCalledWith("/adapter-proxy/dev/exports/docx", {
        body: JSON.stringify({ document, embedFigures }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes);
      expect(result.filename).toBe("resource-document.docx");
    },
  );

  it.each([
    ['attachment; filename="Worksheet 1.docx"', "Worksheet 1.docx"],
    ["attachment; filename=worksheet.docx", "worksheet.docx"],
    [
      "attachment; filename=worksheet.docx; filename*=UTF-8''Maths%20caf%C3%A9.docx",
      "Maths café.docx",
    ],
    [
      "attachment; filename=worksheet.docx; filename*=UTF-8''bad%ZZ.docx",
      "worksheet.docx",
    ],
    // The shape the API emits for a title the ASCII filename cannot carry.
    [
      "attachment; filename=\"R-sum.docx\"; filename*=UTF-8''R%C3%A9sum%C3%A9.docx",
      "Résumé.docx",
    ],
    ['attachment; filename="../../worksheet.docx"', "resource-document.docx"],
    ['attachment; filename="C:\\worksheet.docx"', "resource-document.docx"],
    ['attachment; filename="worksheet.exe"', "resource-document.docx"],
    ["attachment; filename*=UTF-8''bad%0Aname.docx", "resource-document.docx"],
    ["attachment", "resource-document.docx"],
  ])("handles Content-Disposition %s", async (disposition, filename) => {
    respond(
      new Response("binary", { headers: { "content-disposition": disposition } }),
    );

    await expect(exportDocx({ document, embedFigures: true })).resolves.toMatchObject({
      filename,
    });
  });

  it("explains an unavailable development route even with an empty 404", async () => {
    respond(new Response(null, { status: 404 }));

    await expect(exportDocx({ document, embedFigures: true })).rejects.toThrow(
      "Dev routes may be disabled or the export endpoint is not deployed.",
    );
  });

  it("surfaces a JSON API error", async () => {
    respond(
      Response.json({ error: "The export request is invalid." }, { status: 400 }),
    );

    await expect(exportDocx({ document, embedFigures: true })).rejects.toThrow(
      "The export request is invalid.",
    );
  });

  it("handles a non-JSON proxy failure", async () => {
    respond(new Response("<html>Unavailable</html>", { status: 502 }));

    await expect(exportDocx({ document, embedFigures: true })).rejects.toThrow(
      "The API returned HTTP 502.",
    );
  });

  it("propagates network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(exportDocx({ document, embedFigures: true })).rejects.toThrow(
      "Failed to fetch",
    );
  });
});
