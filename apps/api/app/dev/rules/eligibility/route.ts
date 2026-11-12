import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";
import {
  devEligibilityErrorResponse,
  parseDevEligibilityRequest,
} from "@/rule-catalogue/dev-route";
import { evaluateDevEligibility } from "@/rule-catalogue/dev-service";

const allowedMethods = "POST, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export async function POST(request: NextRequest): Promise<Response> {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }
  const headers = getCorsHeaders(request, allowedMethods);
  try {
    const evaluation = parseDevEligibilityRequest(await request.json());
    return NextResponse.json(await evaluateDevEligibility(evaluation), { headers });
  } catch (error) {
    return devEligibilityErrorResponse(error, headers);
  }
}
