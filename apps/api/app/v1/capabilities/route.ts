import {
  resourceAdapterCapabilitiesRequestSchema,
  resourceAdapterCapabilitiesResponseSchema,
} from "@oaknational/resource-adapter-contracts";
import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "../../../src/cors";

const capabilitiesResponse = resourceAdapterCapabilitiesResponseSchema.parse({
  capabilities: [
    {
      id: "worksheetAdapter",
      label: "Adapt worksheet",
      resourceType: "worksheet",
    },
  ],
});

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: getCorsHeaders(request),
    status: 204,
  });
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);
  const body: unknown = await request.json().catch(() => undefined);
  const parsedRequest = resourceAdapterCapabilitiesRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      { message: "Invalid capabilities request." },
      { headers: corsHeaders, status: 400 },
    );
  }

  // Eligibility rules will use parsedRequest.data.lesson in a later slice.
  // The initial endpoint intentionally offers the worksheet adapter for every
  // valid lesson context, establishing the deployable HTTP seam first.
  return NextResponse.json(capabilitiesResponse, { headers: corsHeaders });
}
