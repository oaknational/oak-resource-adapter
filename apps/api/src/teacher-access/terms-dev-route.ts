import { raLogger } from "@oaknational/resource-adapter-logger";
import type { NextRequest } from "next/server";

import { requestAuthenticator, type RequestAuthenticator } from "../authentication";
import { getCorsHeaders } from "../cors";
import { devRouteNotFound, devRoutesEnabled } from "../dev-routes";
import { isProductionDeployment } from "../environment";
import { clearTermsAcceptance } from "./terms";

const allowedMethods = "DELETE, OPTIONS";

export async function devTermsRoute(
  request: NextRequest,
  {
    authenticate = requestAuthenticator,
    clear = clearTermsAcceptance,
  }: Readonly<{
    authenticate?: RequestAuthenticator;
    clear?: (teacherId: string) => Promise<void>;
  }> = {},
): Promise<Response> {
  if (!devRoutesEnabled() || isProductionDeployment()) {
    return devRouteNotFound();
  }
  const headers = new Headers(getCorsHeaders(request, allowedMethods));
  headers.set("Cache-Control", "private, no-store");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "DELETE") {
    return new Response(null, { status: 405, headers });
  }
  const teacher = await authenticate(request);
  if (teacher === null) {
    return Response.json(
      { error: "Sign in to clear your terms acceptance." },
      { status: 401, headers },
    );
  }
  try {
    await clear(teacher.teacherId);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    raLogger("internal-api").error(error, { report: true });
    return Response.json(
      { error: "Your terms acceptance could not be cleared." },
      { status: 500, headers },
    );
  }
}
