import { isModelInvocationError } from "@oaknational/resource-adapter-ai";
import {
  parseResourceDocument,
  ResourceDocumentParseError,
} from "@oaknational/resource-document";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { RegisteredTransformationCommand } from "./application-service";
import { TransformationDependencyError, TransformationRequestError } from "./errors";

const lessonIdentitySchema = z.strictObject({
  lessonSlug: z.string().trim().min(1),
  programmeSlug: z.string().trim().min(1),
});

const commandSchema = z.strictObject({
  contributionId: z.string().trim().min(1).max(200).optional(),
  document: z.unknown(),
  kind: z.string().trim().min(1),
  lesson: lessonIdentitySchema.optional(),
  params: z.unknown().optional(),
  targetBlockId: z.string().trim().min(1).max(256).optional(),
});

export function parseDevTransformationCommand(
  input: unknown,
): RegisteredTransformationCommand {
  const parsed = commandSchema.parse(input);
  return { ...parsed, document: parseResourceDocument(parsed.document) };
}

export function devTransformationErrorResponse(
  error: unknown,
  headers: HeadersInit,
): Response {
  if (error instanceof z.ZodError || error instanceof ResourceDocumentParseError) {
    return NextResponse.json(
      { error: "The transformation request is invalid." },
      { headers, status: 400 },
    );
  }
  if (isModelInvocationError(error)) {
    return NextResponse.json(
      { code: error.code, error: error.message },
      { headers, status: error.code === "INVALID_CONFIGURATION" ? 503 : 502 },
    );
  }
  if (error instanceof TransformationRequestError) {
    return NextResponse.json({ error: error.message }, { headers, status: 400 });
  }
  if (error instanceof TransformationDependencyError) {
    return NextResponse.json({ error: error.message }, { headers, status: 502 });
  }
  return NextResponse.json(
    { error: "The transformation could not be completed." },
    { headers, status: 500 },
  );
}
