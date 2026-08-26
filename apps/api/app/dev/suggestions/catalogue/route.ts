import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";
import { getDevSuggestionCatalogue } from "@/suggestions/dev-service";

const allowedMethods = "GET, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export function GET(request: NextRequest): Response {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }
  return NextResponse.json(getDevSuggestionCatalogue(), {
    headers: getCorsHeaders(request, allowedMethods),
  });
}
