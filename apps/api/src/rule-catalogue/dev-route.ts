import { CurriculumError } from "@oaknational/resource-adapter-curriculum";
import {
  eligibilityEvaluationRequestSchema,
  type EligibilityEvaluationRequest,
} from "@oaknational/resource-adapter-dev-api-contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

export function parseDevEligibilityRequest(
  input: unknown,
): EligibilityEvaluationRequest {
  return eligibilityEvaluationRequestSchema.parse(input);
}

export function devEligibilityErrorResponse(
  error: unknown,
  headers: HeadersInit,
): Response {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "The eligibility request is invalid." },
      { headers, status: 400 },
    );
  }
  if (error instanceof CurriculumError) {
    return NextResponse.json(
      { code: error.code, error: error.message },
      { headers, status: 502 },
    );
  }
  return NextResponse.json(
    { error: "Eligibility could not be evaluated." },
    { headers, status: 500 },
  );
}
