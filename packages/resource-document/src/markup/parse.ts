import { ResourceDocumentParseError } from "../errors.js";
import { parseResourceDocument } from "../parse.js";
import type { ResourceDocument } from "../schema/types.js";
import { parseInteger } from "./attributes.js";
import { parseBlocks } from "./blocks.js";
import { invalidMarkup } from "./errors.js";
import { optionalContext, parseFrontmatter, requireField } from "./frontmatter.js";
import type { ParserState, ResourceMarkupParseResult } from "./types.js";

export const CURRENT_MARKUP_VERSION = "0.1" as const;

function worksheetMetadata(fields: Record<string, string>) {
  const title = requireField(fields, "title");
  const subject = optionalContext(fields, "subject-id", "subject-label");
  const keyStage = optionalContext(fields, "key-stage-id", "key-stage-label");
  const yearGroup = optionalContext(fields, "year-group-id", "year-group-label");
  const readingAge = fields["target-reading-age"];
  return {
    title,
    ...(subject === undefined ? {} : { subject }),
    ...(keyStage === undefined ? {} : { keyStage }),
    ...(yearGroup === undefined ? {} : { yearGroup }),
    ...(readingAge === undefined
      ? {}
      : { targetReadingAge: parseInteger(readingAge, "target-reading-age") }),
  };
}

export function parseResourceMarkup(markup: string): ResourceDocument {
  if (typeof markup !== "string") {
    throw invalidMarkup("Resource markup must be a string.");
  }

  const { body, bodyOffset, fieldLines, fields } = parseFrontmatter(markup);
  const markupVersion = requireField(fields, "markup-version");
  if (markupVersion !== CURRENT_MARKUP_VERSION) {
    throw invalidMarkup(
      `Unsupported resource markup version ${JSON.stringify(markupVersion)}; expected ${JSON.stringify(CURRENT_MARKUP_VERSION)}.`,
      fieldLines["markup-version"],
    );
  }
  const state: ParserState = {
    answers: [],
    assets: new Map(),
    diagnostics: [],
    generatedIds: new Map(),
  };
  const content = parseBlocks(body, state, bodyOffset);
  const profile = requireField(fields, "profile");

  const metadata =
    profile === "worksheet.v0"
      ? worksheetMetadata(fields)
      : { ...(fields.title === undefined ? {} : { title: fields.title }) };

  const documentInput: Record<string, unknown> = {
    schemaVersion: requireField(fields, "schema-version"),
    id: requireField(fields, "document-id"),
    profile,
    language: requireField(fields, "language"),
    metadata,
    content,
    answers: state.answers,
    assets: [...state.assets.values()],
    provenance: {
      source: {
        system: requireField(fields, "source-system"),
        id: requireField(fields, "source-id"),
        ...(fields["source-uri"] === undefined ? {} : { uri: fields["source-uri"] }),
        ...(fields["source-checksum-sha256"] === undefined
          ? {}
          : {
              checksum: {
                algorithm: "sha256",
                value: fields["source-checksum-sha256"],
              },
            }),
      },
      producer: {
        name: requireField(fields, "producer"),
        version: requireField(fields, "producer-version"),
      },
    },
    diagnostics: state.diagnostics,
  };

  return parseResourceDocument(documentInput);
}

export function safeParseResourceMarkup(markup: string): ResourceMarkupParseResult {
  try {
    return { success: true, data: parseResourceMarkup(markup) };
  } catch (error) {
    if (error instanceof ResourceDocumentParseError) {
      return { success: false, error };
    }
    throw error;
  }
}
