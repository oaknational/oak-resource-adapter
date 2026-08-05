/**
 * Forwards harness browser calls to the API server-side, so the browser talks to
 * one origin and the API's bypass secret stays out of the client bundle.
 */
import { NextResponse, type NextRequest } from "next/server";

import { buildApiTarget } from "../target";

// `origin` is forwarded because the API derives Clerk's authorized parties from
// it, and the token's `azp` claim is the harness origin that minted it.
const forwardedRequestHeaders = [
  "authorization",
  "content-type",
  "origin",
  "x-resource-adapter-contract-version",
];

const forwardedResponseHeaders = ["cache-control", "content-type"];

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const target = buildApiTarget(path, request.nextUrl.search);

  const headers = new Headers();
  for (const name of forwardedRequestHeaders) {
    const value = request.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret) {
    headers.set("x-vercel-protection-bypass", bypassSecret);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(target, {
    // Buffered, not streamed: passing `request.body` needs duplex negotiation.
    ...(hasBody ? { body: await request.arrayBuffer() } : {}),
    headers,
    method: request.method,
    // Never follow a redirect: fetch would carry the bypass secret to whatever
    // host it pointed at.
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  for (const name of forwardedResponseHeaders) {
    const value = response.headers.get(name);

    if (value) {
      responseHeaders.set(name, value);
    }
  }

  return new NextResponse(response.body, {
    headers: responseHeaders,
    status: response.status,
  });
}

export { proxy as GET, proxy as POST };
