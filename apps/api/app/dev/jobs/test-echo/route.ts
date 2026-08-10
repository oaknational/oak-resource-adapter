import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";
import { idempotencyKeySchema } from "@/jobs/domain";
import { enqueueJob } from "@/jobs/enqueue-job";
import { IdempotencyConflictError } from "@/jobs/job-repository";
import { toJobResponse } from "@/jobs/job-response";
import { testEchoJob } from "@/jobs/test-echo/definition";

const requestSchema = testEchoJob.input.extend({
  idempotencyKey: idempotencyKeySchema.optional(),
});

const allowedMethods = "POST, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

export async function POST(request: NextRequest): Promise<Response> {
  // Before the body is read or the database is touched.
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }

  const headers = getCorsHeaders(request, allowedMethods);

  try {
    const body = requestSchema.parse(await request.json());
    const job = await enqueueJob({
      idempotencyKey: body.idempotencyKey ?? crypto.randomUUID(),
      input: { message: body.message },
      kind: testEchoJob.kind,
    });

    return NextResponse.json(toJobResponse(job), { headers, status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "The test job request is invalid." },
        { headers, status: 400 },
      );
    }
    if (error instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { headers, status: 409 });
    }
    throw error;
  }
}
