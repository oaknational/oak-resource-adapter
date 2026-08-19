import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";
import { runDevTransformation } from "@/transformations/dev-service";
import {
  devTransformationErrorResponse,
  parseDevTransformationCommand,
} from "@/transformations/dev-route";

const allowedMethods = "POST, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export async function POST(request: NextRequest): Promise<Response> {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }
  const headers = getCorsHeaders(request, allowedMethods);
  try {
    const command = parseDevTransformationCommand(await request.json());
    return NextResponse.json(await runDevTransformation(command), { headers });
  } catch (error) {
    return devTransformationErrorResponse(error, headers);
  }
}
