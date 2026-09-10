import { CurriculumError } from "@oaknational/resource-adapter-curriculum";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  POST as postMaterial,
  OPTIONS as materialOptions,
} from "../../app/dev/oak-material/route";
import { getDevLessonMaterial } from "./dev-service";
vi.mock("./dev-service");

const mockedGetDevLessonMaterial = vi.mocked(getDevLessonMaterial);

const lesson = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
};

function request(body?: unknown): NextRequest {
  return new Request("http://localhost:3001/dev/oak-material", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    method: body === undefined ? "OPTIONS" : "POST",
  }) as NextRequest;
}

describe("the development lesson material route", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    mockedGetDevLessonMaterial.mockReset();
  });

  it("hides the route before reading input when dev routes are disabled", async () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "");

    expect(materialOptions(request()).status).toBe(404);
    expect((await postMaterial(request({ lesson }))).status).toBe(404);
    expect(mockedGetDevLessonMaterial).not.toHaveBeenCalled();
  });

  it("returns the resolved material with CORS headers", async () => {
    mockedGetDevLessonMaterial.mockResolvedValue({
      parts: [
        {
          key: "lesson.keywords",
          label: "Keywords",
          text: "- perspective: A point of view.",
          warning: null,
        },
      ],
    });

    const response = await postMaterial(request({ lesson }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    await expect(response.json()).resolves.toEqual({
      parts: [
        {
          key: "lesson.keywords",
          label: "Keywords",
          text: "- perspective: A point of view.",
          warning: null,
        },
      ],
    });
    expect(mockedGetDevLessonMaterial).toHaveBeenCalledWith(lesson);
  });

  it("rejects a request without a usable lesson identity", async () => {
    const response = await postMaterial(request({ lesson: { lessonSlug: "" } }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The lesson material request is invalid.",
    });
    expect(mockedGetDevLessonMaterial).not.toHaveBeenCalled();
  });

  it("distinguishes a lesson Oak does not publish from Oak being unreachable", async () => {
    for (const [code, status] of [
      ["not-found", 404],
      ["upstream-unavailable", 502],
    ] as const) {
      mockedGetDevLessonMaterial.mockRejectedValue(
        new CurriculumError("No lesson.", { code }),
      );

      const response = await postMaterial(request({ lesson }));

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toMatchObject({ code });
    }
  });
});
