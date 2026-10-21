import { isModelInvocationError } from "@oaknational/resource-adapter-ai";
import { suggestionCommandSchema } from "@oaknational/resource-adapter-dev-api-contracts";
import {
  parseResourceDocument,
  ResourceDocumentParseError,
} from "@oaknational/resource-document/parse";
import { NextResponse } from "next/server";
import { z } from "zod";

import { SuggestionRequestError, type DevSuggestionCommand } from "./dev-service";

export function parseDevSuggestionCommand(input: unknown): DevSuggestionCommand {
  const parsed = suggestionCommandSchema.parse(input);
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
