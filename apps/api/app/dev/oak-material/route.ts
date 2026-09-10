import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";
import {
  devLessonMaterialErrorResponse,
  parseDevLessonMaterialIdentity,
} from "@/oak-material/dev-route";
import { getDevLessonMaterial } from "@/oak-material/dev-service";

const allowedMethods = "POST, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export async function POST(request: NextRequest): Promise<Response> {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }
  const headers = getCorsHeaders(request, allowedMethods);
  try {
    const identity = parseDevLessonMaterialIdentity(await request.json());
    return NextResponse.json(await getDevLessonMaterial(identity), { headers });
  } catch (error) {
    return devLessonMaterialErrorResponse(error, headers);
  }
}
