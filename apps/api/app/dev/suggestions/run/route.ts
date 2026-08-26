import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";
import { runDevSuggestionFlow } from "@/suggestions/dev-service";
import {
  devSuggestionErrorResponse,
  parseDevSuggestionCommand,
} from "@/suggestions/dev-route";

const allowedMethods = "POST, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export async function POST(request: NextRequest): Promise<Response> {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }
  const headers = getCorsHeaders(request, allowedMethods);
  try {
    const command = parseDevSuggestionCommand(await request.json());
    return NextResponse.json(await runDevSuggestionFlow(command), { headers });
  } catch (error) {
    return devSuggestionErrorResponse(error, headers);
  }
}
