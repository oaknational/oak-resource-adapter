import {
  resourceAdapterCapabilitiesRequestSchema,
  resourceAdapterCapabilitiesResponseSchema,
} from "@oaknational/resource-adapter-contracts";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "../../../src/cors";

const log = raLogger("capabilities");

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
    log.warn("Rejected invalid capabilities request");
    return NextResponse.json(
      { message: "Invalid capabilities request." },
      { headers: corsHeaders, status: 400 },
    );
  }

  log.info("Resolved capabilities for lesson %s", parsedRequest.data.lesson.lessonSlug);

  // Eligibility rules will use parsedRequest.data.lesson in a later slice.
  // The initial endpoint intentionally offers the worksheet adapter for every
  // valid lesson context, establishing the deployable HTTP seam first.
  return NextResponse.json(capabilitiesResponse, { headers: corsHeaders });
}
