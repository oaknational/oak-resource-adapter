import { describe, expect, it } from "vitest";

import * as publicApi from "./index.js";

describe("resource-document public API", () => {
  it("exports the intentionally small root surface", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "CURRENT_SCHEMA_VERSION",
      "ResourceDocumentParseError",
      "answerAnnotationSchema",
      "assetSchema",
      "genericDocumentSchema",
      "genericMetadataSchema",
      "getResourceNodeById",
      "getResourceNodesByType",
      "inlineContentSchema",
      "inlineRunSchema",
      "layoutIntentSchema",
      "mathRunSchema",
      "parseResourceDocument",
      "parseResourceDocumentJson",
      "parseResourceDocumentWithInfo",
      "resourceDocumentDiagnosticSchema",
      "resourceDocumentSchema",
      "resourceNodeSchema",
      "safeParseResourceDocument",
      "sourceMapSchema",
      "supportedSchemaVersions",
      "textRunSchema",
      "validateResourceDocumentInvariants",
      "walkResourceDocument",
      "worksheetDocumentSchema",
      "worksheetMetadataSchema",
    ]);
  });
});
