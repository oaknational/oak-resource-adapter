import { loadOriginalResourceDocumentFixture } from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import type { ResourceDocument } from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";
import type { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OPTIONS, POST } from "../../app/dev/exports/docx/route";
import { ExportLimitError } from "./limits";

const converter = vi.hoisted(() => ({ generateDocx: vi.fn() }));

vi.mock("@/exports/docx", () => converter);

vi.mock("@oaknational/resource-document/parse", { spy: true });

const maxBodyBytes = 2 * 1024 * 1024;
const origin = "http://localhost:3000";
const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
let worksheet: ResourceDocument;

beforeAll(async () => {
  worksheet = (await loadOriginalResourceDocumentFixture("linear-equations-smoke"))
    .expectedDocument;
});

beforeEach(() => {
  vi.stubEnv("ENABLE_DEV_ROUTES", "1");
  vi.stubEnv("RESOURCE_ADAPTER_ALLOWED_ORIGINS", origin);
  vi.stubEnv("RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS", "");
  vi.clearAllMocks();
  converter.generateDocx.mockReset().mockResolvedValue(docxBytes);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function request(body: string, headers: Record<string, string> = {}): NextRequest {
  return new Request("http://localhost:3001/dev/exports/docx", {
    body,
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    method: "POST",
  }) as NextRequest;
}

function command(document: unknown = worksheet, options = {}): string {
  return JSON.stringify({ document, ...options });
}

function streamedRequest(chunks: Uint8Array[], headers = {}) {
  const cancel = vi.fn();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) {
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
    cancel,
  });
  const init: RequestInit & { duplex: string } = {
    body,
    duplex: "half",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    method: "POST",
  };
  return {
    request: new Request("http://localhost:3001/dev/exports/docx", init) as NextRequest,
    cancel,
  };
}

function expectCors(response: Response) {
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  expect(response.headers.get("Vary")).toBe("Origin");
}

describe("development DOCX export route", () => {
  it.each([undefined, "false", "0", "", "malformed"])(
    "gates malformed input and OPTIONS before parsing when ENABLE_DEV_ROUTES is %s",
    async (enabled) => {
      vi.stubEnv("ENABLE_DEV_ROUTES", enabled);
      const input = request("{", { "Content-Length": String(maxBodyBytes + 1) });
      const bodyAccess = vi.spyOn(input, "body", "get");

      const response = await POST(input);
      const preflight = OPTIONS(
        new Request(input.url, {
          headers: { Origin: origin },
          method: "OPTIONS",
        }) as NextRequest,
      );

      expect(response.status).toBe(404);
      expect(preflight.status).toBe(404);
      expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
      expect(preflight.headers.has("Access-Control-Allow-Origin")).toBe(false);
      expect(bodyAccess).not.toHaveBeenCalled();
      expect(input.bodyUsed).toBe(false);
      expect(parseResourceDocument).not.toHaveBeenCalled();
      expect(converter.generateDocx).not.toHaveBeenCalled();
    },
  );

  it("serves a gated CORS preflight without parsing or generating", async () => {
    const response = OPTIONS(
      new Request("http://localhost:3001/dev/exports/docx", {
        headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
        method: "OPTIONS",
      }) as NextRequest,
    );

    expect(response.status).toBe(204);
    expectCors(response);
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "Content-Type",
    );
    expect(await response.text()).toBe("");
    expect(parseResourceDocument).not.toHaveBeenCalled();
    expect(converter.generateDocx).not.toHaveBeenCalled();
  });

  it("returns the exact DOCX bytes, attachment headers and CORS with figures enabled by default", async () => {
    const response = await POST(request(command()));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Exploring-linear-equations.docx"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expectCors(response);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(docxBytes);
    expect(parseResourceDocument).toHaveBeenCalledWith(worksheet);
    expect(converter.generateDocx).toHaveBeenCalledExactlyOnceWith(worksheet, {
      embedFigures: true,
    });
  });

  it.each([true, false])(
    "passes embedFigures=%s to the converter",
    async (embedFigures) => {
      const response = await POST(request(command(worksheet, { embedFigures })));

      expect(response.status).toBe(200);
      expect(converter.generateDocx).toHaveBeenCalledExactlyOnceWith(worksheet, {
        embedFigures,
      });
    },
  );

  it("copies only the returned byte view into the response", async () => {
    converter.generateDocx.mockResolvedValue(
      new Uint8Array([9, 1, 2, 9]).subarray(1, 3),
    );

    const response = await POST(request(command()));

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2]),
    );
  });

  it.each([
    [
      '../../Lesson "one"\r\nX-Injected: yes/\\Résumé',
      'attachment; filename="Lesson-one-X-Injected-yes-R-sum.docx"; ' +
        "filename*=UTF-8''Lesson-one-X-Injected-yes-R%C3%A9sum%C3%A9.docx",
    ],
    [
      "数学 🎓",
      'attachment; filename="resource.docx"; ' +
        "filename*=UTF-8''%E6%95%B0%E5%AD%A6.docx",
    ],
    ["a".repeat(200), `attachment; filename="${"a".repeat(100)}.docx"`],
    [
      "Exploring linear equations",
      'attachment; filename="Exploring-linear-equations.docx"',
    ],
  ])(
    "keeps an untransliterated filename alongside a bounded ASCII one for %s",
    async (title, disposition) => {
      const document = { ...worksheet, metadata: { ...worksheet.metadata, title } };

      const response = await POST(request(command(document)));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Disposition")).toBe(disposition);
      expect(response.headers.has("X-Injected")).toBe(false);
    },
  );

  it.each([
    ["a".repeat(99) + "𝒜", "a".repeat(99) + "𝒜"],
    ["a".repeat(99) + "𝒜extra", "a".repeat(99) + "𝒜"],
    ["a".repeat(97) + "数𝒜学尾", "a".repeat(97) + "数𝒜学"],
  ])(
    "bounds the extended filename to 100 intact code points for %s",
    async (title, expectedStem) => {
      const document = { ...worksheet, metadata: { ...worksheet.metadata, title } };

      const response = await POST(request(command(document)));

      expect(response.status).toBe(200);
      const disposition = response.headers.get("Content-Disposition");
      expect(disposition).toMatch(/^attachment; filename="[a-zA-Z0-9_-]+\.docx"; /);
      expect(disposition).toContain("filename*=UTF-8''");
      const encodedFilename = disposition?.split("filename*=UTF-8''")[1] ?? "";
      expect(decodeURIComponent(encodedFilename)).toBe(`${expectedStem}.docx`);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(docxBytes);
    },
  );

  it("uses resource.docx when generic metadata has no title", async () => {
    const document = { ...worksheet, profile: "generic.v0", metadata: {} };

    const response = await POST(request(command(document)));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="resource.docx"',
    );
  });

  it.each([
    ["malformed JSON", () => "{"],
    ["empty body", () => ""],
    ["null envelope", () => "null"],
    ["array envelope", () => "[]"],
    ["missing document", () => "{}"],
    ["null document", () => command(null)],
    ["invalid document schema", () => command({ schemaVersion: "0.1" })],
    ["unknown schema version", () => command({ ...worksheet, schemaVersion: "99.0" })],
    ["unknown envelope field", () => command(worksheet, { unexpected: true })],
    ["non-boolean option", () => command(worksheet, { embedFigures: "false" })],
    ["null option", () => command(worksheet, { embedFigures: null })],
    [
      "duplicate IDs",
      () =>
        command({
          ...worksheet,
          content: [...worksheet.content, ...worksheet.content],
        }),
    ],
    ["dangling asset reference", () => command({ ...worksheet, assets: [] })],
  ])("rejects %s before generation", async (_label, body) => {
    const response = await POST(request(body()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The DOCX export request is invalid.",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expectCors(response);
    expect(converter.generateDocx).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared length before reading the body", async () => {
    const input = request(command(), { "Content-Length": String(maxBodyBytes + 1) });

    const response = await POST(input);

    expect(response.status).toBe(413);
    expect(input.bodyUsed).toBe(false);
    expectCors(response);
    expect(parseResourceDocument).not.toHaveBeenCalled();
    expect(converter.generateDocx).not.toHaveBeenCalled();
  });

  it.each([{}, { "Content-Length": "1" }])(
    "counts streamed UTF-8 bytes regardless of the length header %j",
    async (headers) => {
      const body = new TextEncoder().encode(
        `{"document":"${"é".repeat(maxBodyBytes / 2)}"}`,
      );
      const input = streamedRequest(
        [
          body.subarray(0, maxBodyBytes),
          body.subarray(maxBodyBytes),
          new Uint8Array([32]),
        ],
        headers,
      );

      const response = await POST(input.request);

      expect(response.status).toBe(413);
      expect(input.cancel).toHaveBeenCalledOnce();
      expectCors(response);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(parseResourceDocument).not.toHaveBeenCalled();
      expect(converter.generateDocx).not.toHaveBeenCalled();
    },
  );

  it("accepts a valid request of exactly 2 MiB", async () => {
    const body = command();
    const byteLength = new TextEncoder().encode(body).byteLength;

    const response = await POST(request(body + " ".repeat(maxBodyBytes - byteLength)));

    expect(response.status).toBe(200);
    expect(converter.generateDocx).toHaveBeenCalledOnce();
  });

  it("preserves UTF-8 characters split across stream chunks", async () => {
    const document = {
      ...worksheet,
      metadata: { ...worksheet.metadata, title: "Café" },
    };
    const body = new TextEncoder().encode(command(document));
    const split = body.indexOf(0xc3) + 1;
    const input = streamedRequest([body.subarray(0, split), body.subarray(split)]);

    const response = await POST(input.request);

    expect(response.status).toBe(200);
    expect(converter.generateDocx).toHaveBeenCalledExactlyOnceWith(document, {
      embedFigures: true,
    });
  });

  it("returns 413 when a small input would expand beyond generation limits", async () => {
    converter.generateDocx.mockRejectedValue(new ExportLimitError());
    const response = await POST(request(command()));
    expect(response.status).toBe(413);
    expectCors(response);
    await expect(response.json()).resolves.toEqual({
      error: "The resource exceeds DOCX export limits.",
    });
  });

  it.each([new Error("private document detail"), new SyntaxError("converter detail")])(
    "returns a generic 500 for generation failure %s",
    async (error) => {
      converter.generateDocx.mockRejectedValue(error);

      const response = await POST(request(command()));

      expect(response.status).toBe(500);
      expectCors(response);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: "The DOCX export could not be generated.",
      });
    },
  );

  it("returns a generic 500 for an unexpected body stream failure", async () => {
    const input = request(command());
    vi.spyOn(input, "body", "get").mockReturnValue(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("private stream detail"));
        },
      }),
    );

    const response = await POST(input);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "The DOCX export could not be generated.",
    });
    expect(converter.generateDocx).not.toHaveBeenCalled();
  });

  it("omits CORS grants for untrusted origins on POST and OPTIONS", async () => {
    const input = request(command(), { Origin: "https://untrusted.example" });

    const response = await POST(input);
    const preflight = OPTIONS(
      new Request(input.url, {
        headers: { Origin: "https://untrusted.example" },
        method: "OPTIONS",
      }) as NextRequest,
    );

    expect(response.status).toBe(200);
    expect(preflight.status).toBe(204);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(preflight.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
