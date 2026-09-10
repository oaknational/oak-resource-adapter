import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "@/cors";
import { checkReadiness } from "@/health/readiness";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const readiness = await checkReadiness();
  return NextResponse.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: {
      ...getCorsHeaders(request, "GET, OPTIONS"),
      "Cache-Control": "no-store",
    },
  });
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: getCorsHeaders(request, "GET, OPTIONS"),
    status: 204,
  });
}
