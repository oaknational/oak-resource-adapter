import {
  CurriculumError,
  type LessonIdentity,
} from "@oaknational/resource-adapter-curriculum";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.strictObject({
  lesson: z.strictObject({
    lessonSlug: z.string().trim().min(1),
    programmeSlug: z.string().trim().min(1),
  }),
});

export function parseDevLessonMaterialIdentity(input: unknown): LessonIdentity {
  return requestSchema.parse(input).lesson;
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
