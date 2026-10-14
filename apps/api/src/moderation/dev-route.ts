import { NextResponse } from "next/server";
import { z } from "zod";

import {
  MODERATION_SMOKE_CASES,
  ModerationNotConfiguredError,
  type ModerationSmokeCase,
} from "./dev-service";

// A fixed set of committed inputs, never free text: dev routes are open on Preview and staging.
const requestSchema = z.strictObject({ case: z.enum(MODERATION_SMOKE_CASES) });

export function parseModerationSmokeCase(input: unknown): ModerationSmokeCase {
  return requestSchema.parse(input).case;
}

export function moderationSmokeErrorResponse(
  error: unknown,
  headers: HeadersInit,
): Response {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "The moderation smoke request is invalid." },
      { headers, status: 400 },
    );
  }
  if (error instanceof ModerationNotConfiguredError) {
    return NextResponse.json(
      { error: "MODERATION_API_URL is not configured." },
      { headers, status: 503 },
    );
  }
  return NextResponse.json(
    { error: "The moderation smoke test could not run." },
    { headers, status: 500 },
  );
}
