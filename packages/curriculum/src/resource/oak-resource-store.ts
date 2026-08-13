import { raLogger } from "@oaknational/resource-adapter-logger";
import { unzip } from "fflate";
import { promisify } from "node:util";
import { z } from "zod";

import {
  DEFAULT_RESOURCE_TIMEOUT_MS,
  resolveTimeoutMs,
  type OakResourceStoreConfig,
} from "../config.js";
import { CurriculumError, toCurriculumError } from "../errors.js";
import { fetchWithTimeout } from "../fetch-with-timeout.js";
import { DOWNLOAD_SELECTIONS } from "./download-selection.js";
import {
  findLessonResource,
  resourceUnavailable,
  type LessonResourceType,
  type LessonWithResources,
  type ResourceFile,
  type ResourceStore,
} from "./resource.js";

const log = raLogger("curriculum");

const unzipArchive = promisify(unzip);

const downloadResponseSchema = z.object({
  data: z.object({ url: z.url() }).optional(),
  error: z.object({ message: z.string() }).optional(),
});

/** What one read needs to know, so no step has to be told twice. */
type Download = Readonly<{
  lessonSlug: string;
  type: LessonResourceType;
  selection: string;
  pathInZip: string;
  timeoutMs: number;
}>;

/**
 * Oak's downloads API holds the credential for the private storage the files live
 * in, and answers with a signed URL to a zip of one or two files, so the wanted
 * one is taken out by name.
 */
export function createOakResourceStore(config: OakResourceStoreConfig): ResourceStore {
  const timeoutMs = resolveTimeoutMs(config.timeoutMs, DEFAULT_RESOURCE_TIMEOUT_MS);
  const downloadsApiUrl = withoutTrailingSlashes(config.downloadsApiUrl);

  return {
    async fetch(
      lesson: LessonWithResources,
      type: LessonResourceType,
    ): Promise<ResourceFile> {
      try {
        if (findLessonResource(lesson, type) === undefined) {
          throw resourceUnavailable(lesson, type);
        }

        const { selection, pathInZip, contentType } = DOWNLOAD_SELECTIONS[type];
        const download: Download = {
          lessonSlug: lesson.identity.lessonSlug,
          pathInZip,
          selection,
          timeoutMs,
          type,
        };

        const signedUrl = await requestDownload(downloadsApiUrl, download);
        const archive = await fetchArchive(signedUrl, download);
        const bytes = await takeFromArchive(archive, download);

        return { bytes, contentType, type };
      } catch (error) {
        const curriculumError = toCurriculumError(error);
        // Neither the signed URL nor the bytes may reach a log or a Sentry event.
        log.error(
          {
            lessonSlug: lesson.identity.lessonSlug,
            resourceType: type,
            error: curriculumError,
          },
          // A lesson without this resource is an ordinary answer, not an incident.
          { report: curriculumError.code !== "unavailable-resource" },
        );
        throw curriculumError;
      }
    },
  };
}

function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charAt(end - 1) === "/") {
    end -= 1;
  }

  return url.slice(0, end);
}

async function requestDownload(
  downloadsApiUrl: string,
  download: Download,
): Promise<string> {
  const { lessonSlug, selection, type, timeoutMs } = download;
  const url = `${downloadsApiUrl}/api/lesson/${encodeURIComponent(
    lessonSlug,
  )}/download?selection=${encodeURIComponent(selection)}`;

  return fetchWithTimeout(url, { method: "GET" }, timeoutMs, async (response) => {
    if (response.status === 401 || response.status === 403) {
      throw new CurriculumError(
        `Oak restricts the ${type} of lesson "${lessonSlug}" to signed-in teachers.`,
        { code: "upstream-unavailable" },
      );
    }

    if (response.status === 400 || response.status === 404) {
      throw new CurriculumError(
        `Oak's downloads API holds no ${type} for lesson "${lessonSlug}".`,
        { code: "unavailable-resource" },
      );
    }

    if (!response.ok) {
      throw new CurriculumError(
        `Oak's downloads API answered ${response.status} for a ${type}.`,
        { code: "upstream-unavailable" },
      );
    }

    const payload = downloadResponseSchema.parse(await response.json());

    if (payload.data === undefined) {
      throw new CurriculumError(
        `Oak's downloads API returned no download for a ${type}: ${
          payload.error?.message ?? "no reason given"
        }`,
        { code: "malformed-response" },
      );
    }

    return payload.data.url;
  });
}

function fetchArchive(signedUrl: string, download: Download): Promise<Uint8Array> {
  return fetchWithTimeout(
    signedUrl,
    { method: "GET" },
    download.timeoutMs,
    async (response) => {
      if (!response.ok) {
        throw new CurriculumError(
          `Oak's storage answered ${response.status} for a ${download.type} download.`,
          { code: "upstream-unavailable" },
        );
      }

      return new Uint8Array(await response.arrayBuffer());
    },
  );
}

async function takeFromArchive(
  archive: Uint8Array,
  download: Download,
): Promise<Uint8Array> {
  let files: Record<string, Uint8Array>;
  try {
    files = await unzipArchive(archive);
  } catch (error) {
    throw new CurriculumError(
      `Oak's ${download.type} download is not a readable zip.`,
      {
        cause: error,
        code: "malformed-response",
      },
    );
  }

  const bytes = files[download.pathInZip];

  if (bytes === undefined) {
    throw new CurriculumError(
      `Oak's ${download.type} download holds no ${download.pathInZip}, only ${
        Object.keys(files).join(", ") || "nothing"
      }.`,
      { code: "malformed-response" },
    );
  }

  if (bytes.byteLength === 0) {
    throw new CurriculumError(`Oak's ${download.type} download holds an empty file.`, {
      code: "malformed-response",
    });
  }

  return bytes;
}
