import { describe, expect, it } from "vitest";

import * as publicApi from "./index.js";
import * as parseApi from "./parse.js";
import * as schemaApi from "./schema/index.js";

describe("resource-document public API", () => {
  it("exports the intentionally small root surface", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "CONTRIBUTION_EXTENSION_KEY",
      "contributionIdOf",
      "contributionIdsInDocument",
      "filterResourceNodes",
      "getResourceNodeById",
      "getResourceNodesByType",
      "updateResourceNodeById",
      "validateResourceDocumentInvariants",
      "walkResourceDocument",
    ]);
  });

  it("keeps Zod-backed parsing behind the parse entry point", () => {
    expect(Object.keys(parseApi).sort()).toEqual([
      "CURRENT_SCHEMA_VERSION",
      "ResourceDocumentParseError",
      "parseResourceDocument",
      "parseResourceDocumentJson",
      "parseResourceDocumentWithInfo",
      "safeParseResourceDocument",
      "supportedSchemaVersions",
    ]);
  });

  it("keeps the Zod schemas behind the schema entry point", () => {
    expect(Object.keys(schemaApi).sort()).toEqual([
      "HEADING_LEVELS",
      "answerAnnotationSchema",
      "answerPlacementSchema",
      "assetAlternativeOriginSchema",
      "assetSchema",
      "calloutRoleSchema",
      "genericDocumentSchema",
      "genericMetadataSchema",
      "inlineContentSchema",
      "inlineRunSchema",
      "layoutBreakSchema",
      "layoutIntentSchema",
      "mathRunSchema",
      "preferredWidthSchema",
      "resourceDocumentDiagnosticSchema",
      "resourceDocumentSchema",
      "resourceNodeSchema",
      "responseSpaceKindSchema",
      "sourceMapSchema",
      "textRunSchema",
      "worksheetDocumentSchema",
      "worksheetMetadataSchema",
    ]);
  });
});
