import type { NextRequest } from "next/server";
import { downloadArtifact, downloadOptions } from "@/resource-artifacts/download-route";

export const runtime = "nodejs";
export const OPTIONS = downloadOptions;
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return downloadArtifact(request, (await context.params).id);
}
