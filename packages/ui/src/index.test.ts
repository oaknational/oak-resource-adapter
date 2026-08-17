import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * Every name the published `@oaknational/resource-adapter` entry point exposes.
 * Widening the surface means editing this list, which reads as intent in review.
 */
const EXPECTED_PUBLIC_API = [
  "GetToken",
  "LessonContext",
  "LessonResourceType",
  "ResourceAdapterApiError",
  "ResourceAdapterButton",
  "ResourceAdapterButtonProps",
  "ResourceAdapterCapabilitiesResponse",
  "ResourceAdapterCapability",
  "ResourceAdapterCapabilityId",
  "ResourceAdapterDialog",
  "ResourceAdapterDialogProps",
  "ResourceAdapterErrorBoundary",
  "ResourceAdapterErrorBoundaryProps",
  "ResourceAdapterErrorHandler",
  "ResourceAdapterErrorInfo",
  "ResourceAdapterHostProps",
  "ResourceDocumentSummary",
  "getResourceAdapterCapabilities",
];

/** Export forms that would hide names from the extractor below. */
const opaqueExport =
  /export\s+(?:\*|(?:default|const|let|var|function|class|enum|interface|abstract)\b)/;

describe("public API surface", () => {
  it("only exports the checked-in barrel API", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(opaqueExport);

    const exported = [...source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)]
      .flatMap((match) => (match[1] ?? "").split(","))
      .map((specifier) =>
        specifier
          .trim()
          .replace(/^type\s+/, "")
          .replace(/^.*\s+as\s+/, ""),
      )
      .filter((name) => name.length > 0)
      .sort();

    expect(exported).toEqual(EXPECTED_PUBLIC_API);
  });
});
