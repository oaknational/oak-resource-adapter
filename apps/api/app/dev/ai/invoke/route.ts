import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isModelInvocationError } from "@oaknational/resource-adapter-ai";
import {
  modelInvocationRequestSchema,
  type ModelInvocationResponse,
} from "@oaknational/resource-adapter-dev-api-contracts";

import { invokeDevSmokeText } from "@/ai/dev-invoker";
import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";

const allowedMethods = "POST, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export async function POST(request: NextRequest): Promise<Response> {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }

  const headers = getCorsHeaders(request, allowedMethods);

  try {
    const body = modelInvocationRequestSchema.parse(await request.json());
    const result = await invokeDevSmokeText(body.input);
    const response: ModelInvocationResponse = {
      outcome: result.outcome,
      outputText: result.outcome === "SUCCESS" ? result.output : null,
      providerResponseId: result.meta.providerResponseId ?? null,
      usage: result.meta.usage ?? null,
    };

    return NextResponse.json(response, { headers, status: 200 });
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
