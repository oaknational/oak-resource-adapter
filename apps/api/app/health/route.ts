import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "../../src/cors";

export function GET(request: NextRequest) {
  return NextResponse.json(
    { status: "ok" },
    { headers: getCorsHeaders(request, "GET, OPTIONS") },
  );
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: getCorsHeaders(request, "GET, OPTIONS"),
    status: 204,
  });
}
