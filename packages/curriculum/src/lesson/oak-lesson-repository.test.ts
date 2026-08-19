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

import { CurriculumError } from "../errors.js";
import {
  assetRow,
  assetsRow,
  browseDataRow,
  contentRow,
  quizRow,
  restrictionLevelsRow,
} from "./lesson-fixtures.js";
import { createOakLessonRepository } from "./oak-lesson-repository.js";

const config = {
  apiKey: "test-api-key",
  endpoint: "https://curriculum.example/v1/graphql",
};

const addingFractions = {
  lessonSlug: "adding-fractions",
  programmeSlug: "maths-primary-ks2",
};

function oakResponds(data: {
  assets?: unknown[];
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
            assets: [assetsRow()],
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

describe("the request the repository makes", () => {
  it("presents its API key to Oak as a bearer token", async () => {
    oakResponds({});

    await createOakLessonRepository(config).fetch(addingFractions);

    const [endpoint, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(config.endpoint);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-api-key");
  });

  it("asks for the lesson in the programme it was given", async () => {
    oakResponds({});

    await createOakLessonRepository(config).fetch(addingFractions);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      variables: {
        lessonSlug: addingFractions.lessonSlug,
        programmeSlug: addingFractions.programmeSlug,
      },
    });
  });

  it("asks only for the columns it reads", async () => {
    oakResponds({});

    await createOakLessonRepository(config).fetch(addingFractions);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const { query } = JSON.parse(init.body as string) as { query: string };
    expect(query).toContain("asset_worksheet");
    expect(query).toContain("quiz_starter");
    expect(query).toContain("transcript_sentences");
    expect(query).not.toContain("worksheet_asset_object_url");
    expect(query).not.toContain("starter_quiz");
    expect(query).not.toContain("teacher_tips");
  });

  it("asks the lesson-keyed views for published rows only", async () => {
    oakResponds({});

    await createOakLessonRepository(config).fetch(addingFractions);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const { query } = JSON.parse(init.body as string) as { query: string };
    const stateFilters = query.match(/_state: \{ _eq: "published" \}/g) ?? [];
    expect(stateFilters).toHaveLength(2);
  });
});

describe("the lesson the repository returns", () => {
  it("resolves a lesson that publishes a worksheet", async () => {
    oakResponds({});

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toEqual({
      contentGuidance: [],
      identity: addingFractions,
      keyLearningPoints: [],
      keywords: [],
      misconceptions: [],
      outcome: null,
      transcript: null,
      maxRestrictions: [],
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
          pdf: {
            bucketName: "ingested-assets-example",
            bucketPath: "LESS-EXAMP-1/worksheet/PDF.pdf",
          },
          googleDriveUrl: "https://docs.google.com/presentation/d/example/edit",
        },
      ],
      title: "Adding fractions",
      unit: { slug: "fractions", title: "Fractions" },
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

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({
      programme: {
        examBoard: "AQA",
        keyStage: "KS4",
        subject: "Combined science",
        tier: "higher",
      },
    });
  });

  it("returns the lesson text a transformation can be given", async () => {
    oakResponds({
      content: [
        contentRow({
          key_learning_points: [{ key_learning_point: "A fraction names a part" }],
          misconceptions_and_common_mistakes: [
            {
              misconception: "Adding denominators",
              response: "Use a common denominator",
            },
          ],
          pupil_lesson_outcome: "I can add fractions",
          transcript_sentences: "Today we are adding fractions.",
        }),
      ],
    });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({
      keyLearningPoints: ["A fraction names a part"],
      misconceptions: [
        { misconception: "Adding denominators", response: "Use a common denominator" },
      ],
      outcome: "I can add fractions",
      transcript: "Today we are adding fractions.",
    });
  });

  it("returns the lesson's keywords with Oak's definitions", async () => {
    oakResponds({
      content: [
        contentRow({
          lesson_keywords: [
            { keyword: "numerator", description: "the number above the line" },
          ],
        }),
      ],
    });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({
      keywords: [{ keyword: "numerator", description: "the number above the line" }],
    });
  });

  it("reports no keywords for a lesson that publishes none", async () => {
    oakResponds({ content: [contentRow({ lesson_keywords: null })] });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({ keywords: [] });
  });

  it("ignores content guidance Oak publishes without a label", async () => {
    oakResponds({
      content: [
        contentRow({
          content_guidance: [
            contentGuidanceFixture({ overrides: { contentguidance_label: null } }),
          ],
        }),
      ],
    });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({ contentGuidance: [] });
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

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({
      contentGuidance: [
        "Depiction or discussion of serious crime",
        "Discriminatory language or behaviour",
      ],
    });
  });
});

describe("the resources the repository locates", () => {
  it("publishes no resources for a lesson Oak holds none for", async () => {
    oakResponds({ assets: [assetsRow({ asset_worksheet: null })] });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({ resources: [] });
  });

  it("publishes no resources when Oak holds no assets row at all", async () => {
    oakResponds({ assets: [] });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({ resources: [] });
  });

  it("locates every kind of file Oak publishes for the lesson", async () => {
    oakResponds({
      assets: [
        assetsRow({
          asset_lesson_guide: {
            ...assetRow(),
            asset_type: "lesson_guide",
            url: "https://oak.example/guide",
          },
          asset_slidedeck: { ...assetRow(), asset_type: "slidedeck" },
          asset_supplementary_asset: {
            ...assetRow(),
            asset_type: "supplementary_resource",
          },
          asset_worksheet_answers: { ...assetRow(), asset_type: "worksheet_answers" },
        }),
      ],
    });

    const lesson = await createOakLessonRepository(config).fetch(addingFractions);

    expect(lesson.resources.map((resource) => resource.type)).toEqual([
      "lesson-guide",
      "slide-deck",
      "supplementary",
      "worksheet",
      "worksheet-answers",
    ]);
  });

  it("locates the questions and answers of each quiz", async () => {
    oakResponds({
      assets: [
        assetsRow({ quiz_exit: quizRow("exit"), quiz_starter: quizRow("starter") }),
      ],
    });

    const lesson = await createOakLessonRepository(config).fetch(addingFractions);

    expect(lesson.resources).toEqual(
      expect.arrayContaining([
        {
          type: "starter-quiz",
          pdf: {
            bucketName: "oak-quizzes-example",
            bucketPath: "LESS-EXAMP-1/starter/questions.pdf",
          },
          googleDriveUrl: null,
        },
        {
          type: "exit-quiz-answers",
          pdf: {
            bucketName: "oak-quizzes-example",
            bucketPath: "LESS-EXAMP-1/exit/answers.pdf",
          },
          googleDriveUrl: null,
        },
      ]),
    );
  });

  it("skips a quiz Oak publishes as data with no PDF", async () => {
    oakResponds({
      assets: [
        assetsRow({
          asset_worksheet: null,
          quiz_starter: { ...quizRow("starter"), quiz_object: null },
        }),
      ],
    });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({ resources: [] });
  });

  it("carries the Google document when Oak publishes no file", async () => {
    oakResponds({
      assets: [
        assetsRow({
          asset_worksheet: assetRow({
            asset_object: {
              google_drive: { id: "example", url: "https://docs.google.com/d/x/edit" },
            },
          }),
        }),
      ],
    });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({
      resources: [
        {
          type: "worksheet",
          pdf: null,
          googleDriveUrl: "https://docs.google.com/d/x/edit",
        },
      ],
    });
  });

  it("fails when Oak publishes a resource with nowhere to read it from", async () => {
    oakResponds({
      assets: [assetsRow({ asset_worksheet: assetRow({ asset_object: {} }) })],
    });

    const error = await createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("malformed-response");
    expect((error as Error).cause).toBeInstanceOf(ZodError);
  });

  it("ignores a half-populated file location rather than inventing one", async () => {
    oakResponds({
      assets: [
        assetsRow({
          asset_worksheet: assetRow({
            asset_object: {
              pdf: { bucket_name: "ingested-assets-example", bucket_path: null },
              google_drive: { id: "example", url: "https://docs.google.com/d/x/edit" },
            },
          }),
        }),
      ],
    });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({ resources: [{ type: "worksheet", pdf: null }] });
  });
});

describe("the restrictions the repository reports", () => {
  it("reports the level published against each category of third-party material", async () => {
    oakResponds({
      restrictionLevels: [
        restrictionLevelsRow({
          tpc_media_max_restriction: "Highly restricted",
          tpc_works_max_restriction: "OGL compatible",
        }),
      ],
    });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({
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

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({
      maxRestrictions: [
        { category: "downloadable-files", maxLevel: "restricted" },
        { category: "media", maxLevel: "highly-restricted" },
        { category: "quiz-images", maxLevel: "ogl-equivalent" },
        { category: "works", maxLevel: "ogl-compatible" },
      ],
    });
  });
});

describe("the errors the repository raises", () => {
  it("reports a lesson identity when the lesson is not found", async () => {
    oakResponds({ browseData: [] });

    const error = await createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("not-found");
    expect((error as Error).message).toContain(addingFractions.lessonSlug);
  });

  it("reports a lesson with no content as malformed", async () => {
    oakResponds({ content: [] });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).rejects.toMatchObject({ code: "malformed-response" });
  });

  it("treats rows that agree once mapped as one answer", async () => {
    oakResponds({ browseData: [browseDataRow(), browseDataRow()] });

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).resolves.toMatchObject({ unit: { slug: "fractions" } });
  });

  it("refuses to choose when Oak publishes disagreeing placements", async () => {
    oakResponds({
      browseData: [
        browseDataRow(),
        browseDataRow({ unit_slug: "equivalent-fractions" }),
      ],
    });

    const error = await createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("ambiguous-identity");
    expect((error as Error).message).toContain(addingFractions.programmeSlug);
  });

  it("reports an upstream error status as unavailable rather than not found", async () => {
    oakReturnsStatus(503);

    const error = await createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("upstream-unavailable");
    expect((error as Error).message).toContain("503");
  });

  it("keeps the underlying failure as the cause when Oak cannot be reached", async () => {
    const refused = new Error("ECONNREFUSED");
    oakIsUnreachable(refused);

    const error = await createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch((e: unknown) => e);

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

    const error = await createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("upstream-unavailable");
    expect((error as Error).message).toContain("field 'browseData' not found");
  });

  it("reports a GraphQL error it cannot read as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ errors: ["just a string"] }))),
    );

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).rejects.toMatchObject({ code: "upstream-unavailable" });
  });

  it("reports something thrown that is not an error as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("a bare string"));

    await expect(
      createOakLessonRepository(config).fetch(addingFractions),
    ).rejects.toMatchObject({ code: "upstream-unavailable" });
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

    const error = await createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("malformed-response");
    expect((error as Error).cause).toBeInstanceOf(ZodError);
  });

  it.each([
    ["programmeSlug", { lessonSlug: "adding-fractions", programmeSlug: "" }],
    ["lessonSlug", { lessonSlug: "   ", programmeSlug: "maths-primary-ks2" }],
  ])("refuses to look up an identity with a blank %s", async (_field, identity) => {
    oakResponds({});

    const error = await createOakLessonRepository(config)
      .fetch(identity)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("unusable-identity");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out when Oak does not answer in time", async () => {
    oakNeverAnswers();

    await expect(
      createOakLessonRepository({ ...config, timeoutMs: 10 }).fetch(addingFractions),
    ).rejects.toMatchObject({
      code: "timed-out",
      message: expect.stringContaining("10ms"),
    });
  });

  it("times out on the default timeout when none is configured", async () => {
    vi.useFakeTimers();
    oakNeverAnswers();

    const attempt = createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch((e: unknown) => e);
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
});

describe("what reaches the log", () => {
  it("reports when Oak returns a 503 status", async () => {
    const reported = captureReports();
    oakReturnsStatus(503);

    await createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch(() => undefined);

    expect(reported).toEqual([expect.objectContaining({ identity: addingFractions })]);
  });

  it("reports nothing when there is no lesson", async () => {
    const reported = captureReports();
    oakResponds({ browseData: [] });

    await createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch(() => undefined);

    expect(reported).toEqual([]);
  });

  it("names the field but not the value when a response fails the check", async () => {
    const logged = captureLog();
    const bucketPath = "LESS-PRIVATE-9f31c2/worksheet/PDF.pdf";
    oakResponds({
      assets: [
        assetsRow({
          asset_worksheet: {
            ...assetRow({
              asset_object: {
                pdf: {
                  bucket_name: "ingested-assets-example",
                  bucket_path: bucketPath,
                },
              },
            }),
            asset_uid: 42 as unknown as string,
          },
        }),
      ],
    });

    const error = await createOakLessonRepository(config)
      .fetch(addingFractions)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as Error).cause).toBeInstanceOf(ZodError);
    expect(logged()).not.toContain(bucketPath);
    // A log of nothing at all would pass the assertion above.
    expect(logged()).toContain("asset_uid");
  });

  it("keeps the API key out of the log when Oak cannot be reached", async () => {
    const logged = captureLog();
    const apiKey = "sk-oak-not-a-real-key";
    oakIsUnreachable(new Error("ECONNREFUSED"));

    await createOakLessonRepository({ ...config, apiKey })
      .fetch(addingFractions)
      .catch(() => undefined);

    expect(logged()).not.toContain(apiKey);
    expect(logged()).toContain("ECONNREFUSED");
  });
});
