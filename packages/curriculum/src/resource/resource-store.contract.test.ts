import {
  resetErrorReporter,
  setErrorReporter,
} from "@oaknational/resource-adapter-logger";
import { zipSync } from "fflate";
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildLesson } from "../lesson/in-memory-lesson-repository.js";
import {
  buildResourceFile,
  createInMemoryResourceStore,
  resourceKey,
} from "./in-memory-resource-store.js";
import { createOakResourceStore } from "./oak-resource-store.js";
import type { ResourceStore } from "./resource.js";

const config = { downloadsApiUrl: "https://downloads.example" };
const lesson = buildLesson();
const worksheetFile = buildResourceFile();
const SIGNED_URL = "https://downloads.example/signed/adding-fractions.zip";

function zipOf(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries);
}

/** The two hops: the downloads API answers with a URL, the URL answers with a zip. */
function oakServes(
  archive: Uint8Array,
  downloadResponse: unknown = { data: { url: SIGNED_URL } },
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        url === SIGNED_URL
          ? new Response(archive)
          : new Response(JSON.stringify(downloadResponse)),
      ),
    ),
  );
}

function oakApiAnswers(status: number, body = "no"): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
}

/** Collects what the package reports, through the seam apps use for Sentry. */
function captureReports(): unknown[] {
  const reported: unknown[] = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  setErrorReporter((error) => reported.push(error));
  return reported;
}

function silenceLog(): void {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
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

const implementations: ReadonlyArray<[string, () => ResourceStore]> = [
  ["downloads API", () => createOakResourceStore(config)],
  [
    "in-memory",
    () =>
      createInMemoryResourceStore(
        new Map([
          [resourceKey(lesson.identity.lessonSlug, "worksheet"), worksheetFile],
        ]),
      ),
  ],
];

describe.each(implementations)("%s resource store", (_name, build) => {
  it("returns the bytes and content type of a worksheet", async () => {
    oakServes(zipOf({ "worksheet-questions.pdf": worksheetFile.bytes }));

    await expect(build().fetch(lesson, "worksheet")).resolves.toEqual(worksheetFile);
  });

  it("reports a resource the lesson does not publish", async () => {
    oakServes(zipOf({ "slide-deck.pptx": worksheetFile.bytes }));
    silenceLog();

    await expect(build().fetch(lesson, "slide-deck")).rejects.toMatchObject({
      code: "unavailable-resource",
    });
  });
});

describe("the downloads API resource store", () => {
  it("asks for the selection that names the resource on its own", async () => {
    oakServes(zipOf({ "worksheet-questions.pdf": worksheetFile.bytes }));

    await createOakResourceStore(config).fetch(lesson, "worksheet");

    const [requested] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(requested).toBe(
      "https://downloads.example/api/lesson/adding-fractions/download?selection=worksheet-pdf-questions",
    );
  });

  it("takes the answers out of a zip that also holds the questions", async () => {
    const answers = new TextEncoder().encode("%PDF-1.7 the answers");
    oakServes(
      zipOf({
        "worksheet-questions.pdf": worksheetFile.bytes,
        "worksheet-answers.pdf": answers,
      }),
    );

    const lessonWithAnswers = buildLesson({
      resources: [
        ...lesson.resources,
        { type: "worksheet-answers", pdf: null, googleDriveUrl: null },
      ],
    });

    await expect(
      createOakResourceStore(config).fetch(lessonWithAnswers, "worksheet-answers"),
    ).resolves.toMatchObject({ bytes: answers, type: "worksheet-answers" });
  });

  it("names a slide deck as a presentation, with its own content type", async () => {
    const deck = new TextEncoder().encode("PK a slide deck");
    oakServes(zipOf({ "slide-deck.pptx": deck }));

    const lessonWithDeck = buildLesson({
      resources: [{ type: "slide-deck", pdf: null, googleDriveUrl: null }],
    });

    await expect(
      createOakResourceStore(config).fetch(lessonWithDeck, "slide-deck"),
    ).resolves.toMatchObject({
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  });

  it("tolerates a trailing slash on the configured API URL", async () => {
    oakServes(zipOf({ "worksheet-questions.pdf": worksheetFile.bytes }));

    await createOakResourceStore({
      downloadsApiUrl: "https://downloads.example///",
    }).fetch(lesson, "worksheet");

    const [requested] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(requested).toBe(
      "https://downloads.example/api/lesson/adding-fractions/download?selection=worksheet-pdf-questions",
    );
  });

  it.each([
    {
      answer: "404 for a lesson it holds nothing for",
      status: 404,
      code: "unavailable-resource",
    },
    {
      answer: "400 for a selection it rejects",
      status: 400,
      code: "unavailable-resource",
    },
    { answer: "503 when it is unwell", status: 503, code: "upstream-unavailable" },
  ])("reports $answer as $code", async ({ status, code }) => {
    oakApiAnswers(status);
    silenceLog();

    await expect(
      createOakResourceStore(config).fetch(lesson, "worksheet"),
    ).rejects.toMatchObject({ code });
  });

  it("says a resource is restricted when the downloads API demands a teacher", async () => {
    oakApiAnswers(401);
    silenceLog();

    const error = await createOakResourceStore(config)
      .fetch(lesson, "worksheet")
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "upstream-unavailable" });
    expect((error as Error).message).toContain("signed-in teachers");
  });

  it("reports the reason when the downloads API returns no URL", async () => {
    oakServes(new Uint8Array(), { error: { message: "no resources found" } });
    silenceLog();

    const error = await createOakResourceStore(config)
      .fetch(lesson, "worksheet")
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "malformed-response" });
    expect((error as Error).message).toContain("no resources found");
  });

  it("reports an unexplained refusal from the downloads API", async () => {
    oakServes(new Uint8Array(), {});
    silenceLog();

    const error = await createOakResourceStore(config)
      .fetch(lesson, "worksheet")
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "malformed-response" });
    expect((error as Error).message).toContain("no reason given");
  });

  it("reports an empty zip", async () => {
    oakServes(zipOf({}));
    silenceLog();

    const error = await createOakResourceStore(config)
      .fetch(lesson, "worksheet")
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "malformed-response" });
    expect((error as Error).message).toContain("nothing");
  });

  it("reports a signed URL that no longer serves the zip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url === SIGNED_URL
            ? new Response("gone", { status: 410 })
            : new Response(JSON.stringify({ data: { url: SIGNED_URL } })),
        ),
      ),
    );
    silenceLog();

    await expect(
      createOakResourceStore(config).fetch(lesson, "worksheet"),
    ).rejects.toMatchObject({ code: "upstream-unavailable" });
  });

  it("reports a download that is not a zip", async () => {
    oakServes(new TextEncoder().encode("not a zip at all"));
    silenceLog();

    await expect(
      createOakResourceStore(config).fetch(lesson, "worksheet"),
    ).rejects.toMatchObject({ code: "malformed-response" });
  });

  it("reports a zip without the file it asked for", async () => {
    oakServes(zipOf({ "something-else.pdf": worksheetFile.bytes }));
    silenceLog();

    const error = await createOakResourceStore(config)
      .fetch(lesson, "worksheet")
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "malformed-response" });
    expect((error as Error).message).toContain("something-else.pdf");
  });

  it("refuses an empty file rather than returning zero bytes", async () => {
    oakServes(zipOf({ "worksheet-questions.pdf": new Uint8Array() }));
    silenceLog();

    await expect(
      createOakResourceStore(config).fetch(lesson, "worksheet"),
    ).rejects.toMatchObject({ code: "malformed-response" });
  });

  it("times out when the downloads API does not answer in time", async () => {
    silenceLog();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject((init.signal as AbortSignal).reason);
            });
          }),
      ),
    );

    await expect(
      createOakResourceStore({ ...config, timeoutMs: 10 }).fetch(lesson, "worksheet"),
    ).rejects.toMatchObject({ code: "timed-out" });
  });

  it("reports an unwell downloads API", async () => {
    const reported = captureReports();
    oakApiAnswers(503);

    await createOakResourceStore(config)
      .fetch(lesson, "worksheet")
      .catch(() => undefined);

    expect(reported).toEqual([expect.objectContaining({ resourceType: "worksheet" })]);
  });

  it("reports nothing when the lesson simply has no such resource", async () => {
    const reported = captureReports();

    await createOakResourceStore(config)
      .fetch(lesson, "slide-deck")
      .catch(() => undefined);

    expect(reported).toEqual([]);
  });

  it("keeps the signed URL and the file out of the log when a fetch fails", async () => {
    const logged = captureLog();
    oakServes(zipOf({ "something-else.pdf": worksheetFile.bytes }));

    await createOakResourceStore(config)
      .fetch(lesson, "worksheet")
      .catch(() => undefined);

    expect(logged()).not.toContain(SIGNED_URL);
    // A log of nothing at all would pass the assertion above.
    expect(logged()).toContain("worksheet");
  });
});
