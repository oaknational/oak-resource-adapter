import type { NextRequest } from "next/server";

import { devTermsRoute } from "@/teacher-access/terms-dev-route";

export function DELETE(request: NextRequest): Promise<Response> {
  return devTermsRoute(request);
}

export function OPTIONS(request: NextRequest): Promise<Response> {
  return devTermsRoute(request);
}
