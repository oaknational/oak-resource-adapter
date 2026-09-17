import type { NextRequest } from "next/server";
import { downloadArtifact } from "@/resource-artifacts/download-route";

export const runtime = "nodejs";
export { downloadOptions as OPTIONS } from "@/resource-artifacts/download-route";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return downloadArtifact(request, (await context.params).id);
}
