import {
  moderationSmokeRequestSchema,
  type ModerationSmokeCase,
} from "@oaknational/resource-adapter-dev-api-contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ModerationNotConfiguredError } from "./dev-service";

export function parseModerationSmokeCase(input: unknown): ModerationSmokeCase {
  return moderationSmokeRequestSchema.parse(input).case;
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
