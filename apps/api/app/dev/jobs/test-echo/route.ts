import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCorsHeaders } from "../../../../src/cors";
import { idempotencyKeySchema } from "../../../../src/jobs/domain";
import { enqueueJob } from "../../../../src/jobs/enqueue-job";
import { IdempotencyConflictError } from "../../../../src/jobs/job-repository";
import { toJobResponse } from "../../../../src/jobs/job-response";
import { testEchoJob } from "../../../../src/jobs/test-echo/definition";

const requestSchema = testEchoJob.input.extend({
  idempotencyKey: idempotencyKeySchema.optional(),
});

const allowedMethods = "POST, OPTIONS";

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: getCorsHeaders(request, allowedMethods),
    status: 204,
  });
}

export async function POST(request: NextRequest): Promise<Response> {
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
