import type { ResourceDocument } from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ExportLimitError } from "./limits";

const maxBodyBytes = 2 * 1024 * 1024;
const maxFilenameStem = 100;
const trimmedEdge = new Set(["_", "-"]);

const commandSchema = z.strictObject({
  document: z.unknown(),
  embedFigures: z.boolean().default(true),
});

class ExportBodyTooLargeError extends Error {}

/** Only the request-reading phase can attribute a failure to the client. */
class ExportRequestError extends Error {}

async function readBoundedBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maxBodyBytes) {
    throw new ExportBodyTooLargeError();
  }
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return text + decoder.decode();
      }
      byteCount += value.byteLength;
      if (byteCount > maxBodyBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ExportBodyTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function readDevExportCommand(request: Request): Promise<{
  document: ResourceDocument;
  embedFigures: boolean;
}> {
  const body = await readBoundedBody(request);
  try {
    const parsed = commandSchema.parse(JSON.parse(body));
    return {
      document: parseResourceDocument(parsed.document),
      embedFigures: parsed.embedFigures,
    };
  } catch (cause) {
    throw new ExportRequestError("Unusable export request", { cause });
  }
}

function filenameStem(title: string, disallowed: RegExp): string {
  const characters = Array.from(title.replace(disallowed, "-")).slice(
    0,
    maxFilenameStem,
  );
  let start = 0;
  let end = characters.length;
  while (start < end && trimmedEdge.has(characters[start]!)) start += 1;
  while (end > start && trimmedEdge.has(characters[end - 1]!)) end -= 1;
  return characters.slice(start, end).join("");
}

/**
 * The quoted filename must stay ASCII and free of header syntax. RFC 6266's
 * extended form carries the untransliterated title for readers that accept it.
 */
export function attachmentDisposition(
  document: ResourceDocument,
  extension: string,
): string {
  const title = document.metadata.title ?? "";
  const ascii = filenameStem(title, /[^a-zA-Z0-9_-]+/g) || "resource";
  const unicode = filenameStem(title, /[^\p{L}\p{N}_-]+/gu);
  const disposition = `attachment; filename="${ascii}.${extension}"`;
  if (!unicode || unicode === ascii) {
    return disposition;
  }
  const encoded = encodeURIComponent(`${unicode}.${extension}`);
  return `${disposition}; filename*=UTF-8''${encoded}`;
}

export function devExportErrorResponse(
  error: unknown,
  headers: HeadersInit,
  format: string,
): Response {
  if (error instanceof ExportLimitError) {
    return NextResponse.json(
      { error: `The resource exceeds ${format} export limits.` },
      { headers, status: 413 },
    );
  }
  if (error instanceof ExportBodyTooLargeError) {
    return NextResponse.json(
      { error: `The ${format} export request exceeds the 2 MiB limit.` },
      { headers, status: 413 },
    );
  }
  if (error instanceof ExportRequestError) {
    return NextResponse.json(
      { error: `The ${format} export request is invalid.` },
      { headers, status: 400 },
    );
  }
  return NextResponse.json(
    { error: `The ${format} export could not be generated.` },
    { headers, status: 500 },
  );
}
