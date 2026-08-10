import { NextResponse, type NextRequest } from "next/server";

import { getCorsHeaders } from "../../../../src/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "../../../../src/dev-routes";
import { jobIdSchema } from "../../../../src/jobs/domain";
import { getJob } from "../../../../src/jobs/job-repository";
import { toJobResponse } from "../../../../src/jobs/job-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const allowedMethods = "GET, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  // Before the ID is parsed or the database is touched.
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }

  const headers = getCorsHeaders(request, allowedMethods);

  const parsedId = jobIdSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "The job ID is invalid." },
      { headers, status: 400 },
    );
  }

  const job = await getJob(parsedId.data);
  if (!job) {
    return new Response(null, { headers, status: 404 });
  }

  return NextResponse.json(toJobResponse(job), { headers });
}
