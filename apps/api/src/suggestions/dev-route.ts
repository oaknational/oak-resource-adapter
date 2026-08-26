import { isModelInvocationError } from "@oaknational/resource-adapter-ai";
import {
  parseResourceDocument,
  ResourceDocumentParseError,
} from "@oaknational/resource-document/parse";
import { NextResponse } from "next/server";
import { z } from "zod";

import { SuggestionRequestError, type DevSuggestionCommand } from "./dev-service";

const appliedTransformationSchema = z.strictObject({
  contributionId: z.string().trim().min(1).max(200).optional(),
  kind: z.string().trim().min(1),
  params: z.record(z.string(), z.unknown()),
  targetBlockId: z.string().trim().min(1).max(256).optional(),
});

const commandSchema = z.strictObject({
  appliedTransformations: z.array(appliedTransformationSchema).default([]),
  document: z.unknown(),
  flowId: z.string().trim().min(1).max(200),
});

export function parseDevSuggestionCommand(input: unknown): DevSuggestionCommand {
  const parsed = commandSchema.parse(input);
  return { ...parsed, document: parseResourceDocument(parsed.document) };
}

export function devSuggestionErrorResponse(
  error: unknown,
  headers: HeadersInit,
): Response {
  if (error instanceof z.ZodError || error instanceof ResourceDocumentParseError) {
    return NextResponse.json(
      { error: "The suggestion request is invalid." },
      { headers, status: 400 },
    );
  }
  if (error instanceof SuggestionRequestError) {
    return NextResponse.json({ error: error.message }, { headers, status: 400 });
  }
  if (isModelInvocationError(error)) {
    return NextResponse.json(
      { code: error.code, error: error.message },
      { headers, status: error.code === "INVALID_CONFIGURATION" ? 503 : 502 },
    );
  }
  return NextResponse.json(
    { error: "Suggestions could not be generated." },
    { headers, status: 500 },
  );
}
