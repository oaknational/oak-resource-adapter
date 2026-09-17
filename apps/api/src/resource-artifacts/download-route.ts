import { Readable } from "node:stream";
import { raLogger } from "@oaknational/resource-adapter-logger";
import {
  isArtifactNotFound,
  readArtifact,
} from "@oaknational/resource-adapter-storage";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { requestAuthenticator } from "../authentication";
import { getCorsHeaders } from "../cors";
import { attachmentDisposition } from "../exports/attachment-disposition";
import { findOwnedArtifact } from "./repository";

const log = raLogger("internal-api");
const allowedMethods = "GET, OPTIONS";

function responseHeaders(request: NextRequest) {
  const headers = new Headers(getCorsHeaders(request, allowedMethods));
  headers.set("Cache-Control", "private, no-store");
  headers.set("Access-Control-Expose-Headers", "Content-Disposition");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

export function downloadOptions(request: NextRequest) {
  return new Response(null, { status: 204, headers: responseHeaders(request) });
}

export async function downloadArtifact(
  request: NextRequest,
  id: string,
): Promise<Response> {
  const headers = responseHeaders(request);
  let stream: Readable | undefined;
  let cleanup = () => {};
  try {
    const teacher = await requestAuthenticator(request);
    if (!teacher)
      return Response.json({ error: "Unauthorised" }, { status: 401, headers });
    const owned = z.uuid().safeParse(id).success
      ? await findOwnedArtifact(id, teacher.teacherId)
      : null;
    if (!owned) return Response.json({ error: "Not found" }, { status: 404, headers });
    const { artifact, title } = owned;
    const disposition = attachmentDisposition(title, artifact.format);
    const opened = await readArtifact(artifact.storageKey);
    stream = opened.stream;
    const source = stream;
    const abort = () => source.destroy(new Error("Download cancelled"));
    request.signal.addEventListener("abort", abort, { once: true });
    cleanup = () => request.signal.removeEventListener("abort", abort);
    const reader = (
      Readable.toWeb(source, {
        strategy: {
          highWaterMark: 64 * 1024,
          size: (chunk: Uint8Array) => chunk.byteLength,
        },
      }) as ReadableStream<Uint8Array>
    ).getReader();
    if (request.signal.aborted) abort();
    // Open GCS before committing headers: a deletion after metadata lookup still returns 404.
    let first: ReadableStreamReadResult<Uint8Array> | undefined = await reader.read();
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          try {
            const chunk = first ?? (await reader.read());
            first = undefined;
            if (chunk.done) {
              cleanup();
              controller.close();
            } else controller.enqueue(chunk.value);
          } catch (error) {
            cleanup();
            if (!request.signal.aborted) log.error(error, { report: true });
            controller.error(error);
          }
        },
        async cancel(reason) {
          cleanup();
          await reader.cancel(reason);
        },
      },
      { highWaterMark: 0 },
    );
    headers.set("Content-Type", artifact.mimeType);
    // The stream is pinned to this metadata's generation, so its size describes
    // the bytes being sent; the recorded byteSize may predate a re-upload.
    const size = Number(opened.metadata.size);
    if (Number.isSafeInteger(size) && size >= 0)
      headers.set("Content-Length", String(size));
    headers.set("Content-Disposition", disposition);
    return new Response(body, { headers });
  } catch (error) {
    cleanup();
    stream?.destroy();
    if (isArtifactNotFound(error))
      return Response.json({ error: "Not found" }, { status: 404, headers });
    if (!request.signal.aborted) log.error(error, { report: true });
    return Response.json(
      { error: "The file could not be downloaded." },
      { status: 500, headers },
    );
  }
}
