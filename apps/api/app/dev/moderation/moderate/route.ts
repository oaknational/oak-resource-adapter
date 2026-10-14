import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";
import {
  moderationSmokeErrorResponse,
  parseModerationSmokeCase,
} from "@/moderation/dev-route";
import { runModerationSmokeCase } from "@/moderation/dev-service";

const allowedMethods = "POST, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export async function POST(request: NextRequest): Promise<Response> {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }
  const headers = new Headers(getCorsHeaders(request, allowedMethods));
  headers.set("Cache-Control", "no-store");
  try {
    const smokeCase = parseModerationSmokeCase(await request.json());
    return NextResponse.json(await runModerationSmokeCase(smokeCase), { headers });
  } catch (error) {
    return moderationSmokeErrorResponse(error, headers);
  }
}
