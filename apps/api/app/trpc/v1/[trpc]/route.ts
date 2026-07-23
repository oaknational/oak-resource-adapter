import { appRouterV1 } from "@oaknational/resource-adapter-contracts/server";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { NextResponse, type NextRequest } from "next/server";

import { createContext } from "../../../../src/context";
import { getCorsHeaders } from "../../../../src/cors";

const endpoint = "/trpc/v1";
const allowedMethods = "GET, POST, OPTIONS";
const log = raLogger("capabilities");

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: getCorsHeaders(request, allowedMethods),
    status: 204,
  });
}

async function handleRequest(request: NextRequest): Promise<Response> {
  const response = await fetchRequestHandler({
    allowMethodOverride: true,
    createContext: ({ req }) => createContext(req),
    endpoint,
    onError: ({ error }) => {
      // 5xx = server/dependency fault → Sentry. 4xx = client's fault (auth,
      // version, bad input) → console only.
      log.error(error, { report: getHTTPStatusCodeFromError(error) >= 500 });
    },
    req: request,
    router: appRouterV1,
  });
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(getCorsHeaders(request, allowedMethods))) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export const GET = handleRequest;
export const POST = handleRequest;
