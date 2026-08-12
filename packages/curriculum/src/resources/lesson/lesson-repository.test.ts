import {
  contentGuidanceFixture,
  programmeFieldsFixture,
} from "@oaknational/oak-curriculum-schema";
import {
  resetErrorReporter,
  setErrorReporter,
} from "@oaknational/resource-adapter-logger";
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { CurriculumError } from "./errors.js";
import { createOakLessonRepository } from "./lesson-repository.js";
import {
  browseDataRow,
  contentRow,
  restrictionLevelsRow,
} from "./oak-response-fixtures.js";

const config = {
  apiKey: "test-api-key",
  endpoint: "https://curriculum.example/v1/graphql",
};

const addingFractions = {
  lessonSlug: "adding-fractions",
  programmeSlug: "maths-primary-ks2",
};

function oakResponds(data: {
  browseData?: unknown[];
  content?: unknown[];
  restrictionLevels?: unknown[];
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            browseData: [browseDataRow()],
            content: [contentRow()],
            restrictionLevels: [restrictionLevelsRow()],
            ...data,
          },
        }),
      ),
    ),
  );
}

function oakReturnsStatus(status: number, body = "upstream is unwell"): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
}

function oakIsUnreachable(cause: Error): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
}

function oakNeverAnswers(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_endpoint: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject((init.signal as AbortSignal).reason);
          });
        }),
    ),
  );
}

/** Collects what the package reports, through the seam apps use for Sentry. */
function captureReports(): unknown[] {
  const reported: unknown[] = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  setErrorReporter((error) => reported.push(error));
  return reported;
}

function captureLog(): () => string {
  const written: unknown[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    written.push(...args);
  });
  setErrorReporter((error) => written.push(error));
  return () => written.map((value) => inspect(value, { depth: null })).join("\n");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetErrorReporter();
});

describe("OakLessonRepository.fetch", () => {
  it("presents its API key to Oak as a bearer token", async () => {
    oakResponds({});

    const repository = createOakLessonRepository(config);
    await repository.fetch(addingFractions);

    const [endpoint, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(config.endpoint);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-api-key");
  });

  it("uses the correct request body", async () => {
    oakResponds({});

    const repository = createOakLessonRepository(config);
    await repository.fetch(addingFractions);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      variables: {
        browseDataWhere: {
          lesson_slug: { _eq: addingFractions.lessonSlug },
          programme_slug: { _eq: addingFractions.programmeSlug },
        },
        lessonSlug: addingFractions.lessonSlug,
      },
    });
  });

  it("resolves a lesson that publishes a worksheet", async () => {
    oakResponds({});

    const repository = createOakLessonRepository(config);

    await expect(repository.fetch(addingFractions)).resolves.toEqual({
      contentGuidance: [],
      identity: addingFractions,
      isLegacy: false,
      programme: {
        examBoard: null,
        keyStage: "KS2",
        keyStageSlug: "ks2",
        subject: "Maths",
        subjectSlug: "maths",
        tier: null,
      },
      resources: [
        {
          type: "worksheet",
          url: "https://oak.example/worksheets/adding-fractions.pdf",
        },
      ],
      maxRestrictions: [],
      title: "Adding fractions",
      unit: { orderInUnit: 3, slug: "fractions", title: "Fractions" },
    });
  });

  it("reports the level published against each category of third-party material", async () => {
    oakResponds({
      restrictionLevels: [
        restrictionLevelsRow({
          tpc_media_max_restriction: "Highly restricted",
          tpc_works_max_restriction: "OGL compatible",
        }),
      ],
    });

    const repository = createOakLessonRepository(config);

    await expect(repository.fetch(addingFractions)).resolves.toMatchObject({
      maxRestrictions: [
        { category: "media", maxLevel: "highly-restricted" },
        { category: "works", maxLevel: "ogl-compatible" },
      ],
    });
  });

  it("reads every category Oak publishes a level against", async () => {
    oakResponds({
      restrictionLevels: [
        restrictionLevelsRow({
          tpc_downloadablefiles_max_restriction: "Restricted",
          tpc_media_max_restriction: "Highly restricted",
          tpc_quizimages_max_restriction: "OGL equivalent",
          tpc_works_max_restriction: "OGL compatible",
        }),
      ],
    });

    const repository = createOakLessonRepository(config);

    await expect(repository.fetch(addingFractions)).resolves.toMatchObject({
      maxRestrictions: [
        { category: "downloadable-files", maxLevel: "restricted" },
        { category: "media", maxLevel: "highly-restricted" },
        { category: "quiz-images", maxLevel: "ogl-equivalent" },
        { category: "works", maxLevel: "ogl-compatible" },
      ],
    });
  });

  it("carries the tier and exam board of an examined programme", async () => {
    oakResponds({
      browseData: [
        browseDataRow({
          programme_fields: programmeFieldsFixture({
            overrides: {
              examboard: "AQA",
              examboard_slug: "aqa",
              keystage: "KS4",
              keystage_slug: "ks4",
              subject: "Combined science",
              subject_slug: "combined-science",
              tier: "higher",
              tier_slug: "higher",
            },
          }),
        }),
      ],
    });

    const repository = createOakLessonRepository(config);

    await expect(repository.fetch(addingFractions)).resolves.toMatchObject({
      programme: {
        examBoard: "AQA",
        keyStage: "KS4",
        subject: "Combined science",
        tier: "higher",
      },
    });
  });

  it("reports a lesson identity when lesson is not found", async () => {
    oakResponds({ browseData: [] });

    const repository = createOakLessonRepository(config);

    const error = await repository.fetch(addingFractions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("not-found");
    expect((error as Error).message).toContain(addingFractions.lessonSlug);
  });

  it("reports a lesson with no content as malformed", async () => {
    oakResponds({ content: [] });

    const repository = createOakLessonRepository(config);

    const error = await repository.fetch(addingFractions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("malformed-response");
  });

  it("reports an upstream error status as unavailable rather than not found", async () => {
    oakReturnsStatus(503);

    const repository = createOakLessonRepository(config);

    const error = await repository.fetch(addingFractions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("upstream-unavailable");
    expect((error as Error).message).toContain("503");
  });

  it("keeps the underlying failure as the cause when Oak cannot be reached", async () => {
    const refused = new Error("ECONNREFUSED");
    oakIsUnreachable(refused);

    const repository = createOakLessonRepository(config);

    const error = await repository.fetch(addingFractions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as Error).cause).toBe(refused);
  });

  it("reports GraphQL errors carried by a 200 response as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [{ message: "field 'browseData' not found in type: 'query_root'" }],
          }),
        ),
      ),
    );

    const repository = createOakLessonRepository(config);

    const error = await repository.fetch(addingFractions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("upstream-unavailable");
    expect((error as Error).message).toContain("field 'browseData' not found");
  });

  it("reports a response it cannot recognise as a validation failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ data: { browseData: "not an array" } })),
        ),
    );

    const repository = createOakLessonRepository(config);

    const error = await repository.fetch(addingFractions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("malformed-response");
    expect((error as Error).cause).toBeInstanceOf(ZodError);
  });

  it.each([
    ["programmeSlug", { lessonSlug: "adding-fractions", programmeSlug: "" }],
    ["lessonSlug", { lessonSlug: "   ", programmeSlug: "maths-primary-ks2" }],
  ])("refuses to look up an identity with a blank %s", async (_field, identity) => {
    oakResponds({});

    const repository = createOakLessonRepository(config);

    const error = await repository.fetch(identity).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("unusable-identity");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out when Oak does not answer in time", async () => {
    oakNeverAnswers();

    const repository = createOakLessonRepository({ ...config, timeoutMs: 10 });

    await expect(repository.fetch(addingFractions)).rejects.toMatchObject({
      code: "timed-out",
      message: expect.stringContaining("10ms"),
    });
  });

  it("times out on the default timeout when none is configured", async () => {
    vi.useFakeTimers();
    oakNeverAnswers();

    const repository = createOakLessonRepository(config);
    const attempt = repository.fetch(addingFractions).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await attempt).toMatchObject({
      code: "timed-out",
      message: expect.stringContaining("5000ms"),
    });
    vi.useRealTimers();
  });

  it.each([0, -1, 1.5, 2_147_483_648])(
    "refuses to be built with a timeout of %s",
    (timeoutMs) => {
      expect(() => createOakLessonRepository({ ...config, timeoutMs })).toThrow(
        RangeError,
      );
    },
  );

  it("reports when Oak returns a 503 status", async () => {
    const reported = captureReports();
    oakReturnsStatus(503);

    const repository = createOakLessonRepository(config);
    await repository.fetch(addingFractions).catch(() => undefined);

    expect(reported).toEqual([expect.objectContaining({ identity: addingFractions })]);
  });

  it("reports nothing when there is no lesson", async () => {
    const reported = captureReports();
    oakResponds({ browseData: [] });

    const repository = createOakLessonRepository(config);
    await repository.fetch(addingFractions).catch(() => undefined);

    expect(reported).toEqual([]);
  });

  it("marks a legacy lesson as legacy", async () => {
    oakResponds({ browseData: [browseDataRow({ is_legacy: true })] });

    const repository = createOakLessonRepository(config);

    await expect(repository.fetch(addingFractions)).resolves.toMatchObject({
      isLegacy: true,
    });
  });

  it("returns content guidance labels as Oak publishes them", async () => {
    oakResponds({
      content: [
        contentRow({
          content_guidance: [
            contentGuidanceFixture({
              overrides: {
                contentguidance_label: "Depiction or discussion of serious crime",
              },
            }),
            contentGuidanceFixture({
              overrides: {
                contentguidance_label: "Discriminatory language or behaviour",
              },
            }),
          ],
        }),
      ],
    });

    const repository = createOakLessonRepository(config);

    await expect(repository.fetch(addingFractions)).resolves.toMatchObject({
      contentGuidance: [
        "Depiction or discussion of serious crime",
        "Discriminatory language or behaviour",
      ],
    });
  });

  it("publishes no worksheet resource for a lesson without one", async () => {
    oakResponds({
      content: [
        contentRow({
          has_worksheet_asset_object: false,
          worksheet_asset_object_url: null,
        }),
      ],
    });

    const repository = createOakLessonRepository(config);

    await expect(repository.fetch(addingFractions)).resolves.toMatchObject({
      resources: [],
    });
  });

  it("fails when Oak claims a worksheet but publishes no URL for it", async () => {
    oakResponds({
      content: [
        contentRow({
          has_worksheet_asset_object: true,
          worksheet_asset_object_url: null,
        }),
      ],
    });

    const repository = createOakLessonRepository(config);

    const error = await repository.fetch(addingFractions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("malformed-response");
    expect((error as Error).cause).toBeInstanceOf(ZodError);
  });
});

/**
 * A log and a Sentry event may name what failed. Neither may carry a value Oak
 * sent, nor anything used to ask Oak for it.
 */
describe("what reaches the log", () => {
  it("names the field but not the value when a response fails the check", async () => {
    const logged = captureLog();
    const worksheetUrl = "https://oak.example/private/worksheet-9f31c2.pdf";
    oakResponds({
      content: [{ ...contentRow(), has_worksheet_asset_object: worksheetUrl }],
    });

    const repository = createOakLessonRepository(config);
    const error = await repository.fetch(addingFractions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as Error).cause).toBeInstanceOf(ZodError);
    expect(logged()).not.toContain(worksheetUrl);
    // A log of nothing at all would pass the assertion above.
    expect(logged()).toContain("has_worksheet_asset_object");
  });

  it("keeps the API key out of the log when Oak cannot be reached", async () => {
    const logged = captureLog();
    const apiKey = "sk-oak-not-a-real-key";
    oakIsUnreachable(new Error("ECONNREFUSED"));

    const repository = createOakLessonRepository({ ...config, apiKey });
    await repository.fetch(addingFractions).catch(() => undefined);

    expect(logged()).not.toContain(apiKey);
    expect(logged()).toContain("ECONNREFUSED");
  });
});
