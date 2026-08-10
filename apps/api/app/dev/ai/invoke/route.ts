import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isModelInvocationError } from "@oaknational/resource-adapter-ai";

import { invokeDevSmokeText } from "../../../../src/ai/dev-invoker";
import { getCorsHeaders } from "../../../../src/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "../../../../src/dev-routes";

const requestSchema = z.object({
  input: z.string().min(1).max(2000),
});

const allowedMethods = "POST, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export async function POST(request: NextRequest): Promise<Response> {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }

  const headers = getCorsHeaders(request, allowedMethods);

  try {
    const body = requestSchema.parse(await request.json());
    const result = await invokeDevSmokeText(body.input);

    return NextResponse.json(
      {
        outcome: result.outcome,
        outputText: result.outcome === "SUCCESS" ? result.output : null,
        providerResponseId: result.meta.providerResponseId ?? null,
        usage: result.meta.usage ?? null,
      },
      { headers, status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "The model invocation request is invalid." },
        { headers, status: 400 },
      );
    }
    if (isModelInvocationError(error)) {
      return NextResponse.json(
        { code: error.code, error: error.message },
        { headers, status: error.code === "INVALID_CONFIGURATION" ? 503 : 502 },
      );
    }
    throw error;
  }
}
