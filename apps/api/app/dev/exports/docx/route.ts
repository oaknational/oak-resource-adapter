import { type NextRequest } from "next/server";

import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";
import {
  attachmentDisposition,
  devExportErrorResponse,
  readDevExportCommand,
} from "@/exports/dev-route";
import { generateDocx } from "@/exports/docx";

const allowedMethods = "POST, OPTIONS";
const format = "DOCX";
const contentType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export async function POST(request: NextRequest): Promise<Response> {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }

  const headers = new Headers(getCorsHeaders(request, allowedMethods));
  headers.set("Cache-Control", "no-store");

  try {
    const command = await readDevExportCommand(request);
    const bytes = await generateDocx(command.document, {
      embedFigures: command.embedFigures,
    });
    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", attachmentDisposition(command.document, "docx"));
    // Re-wrap rather than pass `bytes.buffer`, which for a Buffer is the shared pool.
    return new Response(new Uint8Array(bytes), { headers });
  } catch (error) {
    return devExportErrorResponse(error, headers, format);
  }
}
