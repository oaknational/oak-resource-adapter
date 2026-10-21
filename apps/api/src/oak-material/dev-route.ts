import {
  CurriculumError,
  type LessonIdentity,
} from "@oaknational/resource-adapter-curriculum";
import { oakMaterialRequestSchema } from "@oaknational/resource-adapter-dev-api-contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

export function parseDevLessonMaterialIdentity(input: unknown): LessonIdentity {
  return oakMaterialRequestSchema.parse(input).lesson;
}

export function devLessonMaterialErrorResponse(
  error: unknown,
  headers: HeadersInit,
): Response {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "The lesson material request is invalid." },
      { headers, status: 400 },
    );
  }
  if (error instanceof CurriculumError) {
    return NextResponse.json(
      { code: error.code, error: error.message },
      { headers, status: error.code === "not-found" ? 404 : 502 },
    );
  }
  return NextResponse.json(
    { error: "The lesson material could not be read." },
    { headers, status: 500 },
  );
}
