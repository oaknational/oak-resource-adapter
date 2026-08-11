import type { AnyRouter, inferRouterContext } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { NextResponse, type NextRequest } from "next/server";
import { raLogger } from "@oaknational/resource-adapter-logger";

import { getCorsHeaders } from "@/cors";

const allowedMethods = "GET, POST, OPTIONS";

const unreportedErrorCodes = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
  "CLIENT_CLOSED_REQUEST",
]);

interface TrpcRouteConfig<TRouter extends AnyRouter> {
  router: TRouter;
  endpoint: string;
  log: ReturnType<typeof raLogger>;
  createContext: (req: Request) => Promise<inferRouterContext<TRouter>>;
}

function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: getCorsHeaders(request, allowedMethods),
    status: 204,
  });
}

export function createTrpcRouteHandler<TRouter extends AnyRouter>(
  config: TrpcRouteConfig<TRouter>,
) {
  async function handleRequest(request: NextRequest): Promise<Response> {
    const response = await fetchRequestHandler({
      allowMethodOverride: true,
      createContext: ({ req }) => config.createContext(req),
      endpoint: config.endpoint,
      onError: ({ error }) => {
        config.log.error(error, { report: !unreportedErrorCodes.has(error.code) });
      },
      req: request,
      router: config.router,
    });
    const headers = new Headers(response.headers);

    for (const [name, value] of Object.entries(
      getCorsHeaders(request, allowedMethods),
    )) {
      headers.set(name, value);
    }

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  return { GET: handleRequest, POST: handleRequest, OPTIONS };
}
