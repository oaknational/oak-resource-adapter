import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";
import { getDevTransformationCatalogue } from "@/transformations/dev-service";

const allowedMethods = "GET, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export function GET(request: NextRequest): Response {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }
  return NextResponse.json(getDevTransformationCatalogue(), {
    headers: getCorsHeaders(request, allowedMethods),
  });
}
