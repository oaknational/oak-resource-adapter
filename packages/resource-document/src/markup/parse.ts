import { ResourceDocumentParseError } from "../errors.js";
import { parseResourceDocument } from "../parse.js";
import {
  answerPlacementSchema,
  assetAlternativeOriginSchema,
  calloutRoleSchema,
  HEADING_LEVELS,
  layoutBreakSchema,
  preferredWidthSchema,
  responseSpaceKindSchema,
} from "../schema/current.js";
import type {
  AnswerAnnotation,
  Asset,
  CalloutNode,
  NamespacedExtensions,
  ResourceDocument,
  ResourceDocumentDiagnostic,
  ResourceNode,
} from "../schema/current.js";
import { parseInlineContent } from "./inline.js";
import type { ResourceMarkupParseResult } from "./types.js";

interface ParsedFrontmatter {
  fields: Record<string, string>;
  fieldLines: Record<string, number>;
  body: string[];
  bodyOffset: number;
}

interface ParserState {
  answers: AnswerAnnotation[];
  assets: Map<string, Asset>;
  diagnostics: ResourceDocumentDiagnostic[];
  generatedIds: Map<string, number>;
}

interface ParsedDirective {
  name: string;
  attributes: Record<string, string>;
  inner: string[];
  innerOffset: number;
  raw: string;
  line: number;
  nextIndex: number;
}

const directiveOpenPattern = /^:::(oak-[a-z0-9-]+)(?:\s+\{(.*)\})?\s*$/;
const headingPattern = /^(#{1,6})\s+(\S.*)$/;

export const CURRENT_MARKUP_VERSION = "0.1" as const;

function invalidMarkup(message: string, line?: number): ResourceDocumentParseError {
  return new ResourceDocumentParseError(
    "invalid_markup",
    line === undefined ? message : `${message} (line ${line})`,
    line === undefined ? {} : { line },
  );
}

/** Annotates a markup failure with the innermost enclosing line, once. */
function atLine<Result>(line: number, parse: () => Result): Result {
  try {
    return parse();
  } catch (error) {
    if (
      error instanceof ResourceDocumentParseError &&
      error.code === "invalid_markup" &&
      error.context.line === undefined
    ) {
      throw invalidMarkup(error.message, line);
    }
    throw error;
  }
}

const supportedFrontmatterFields = new Set([
  "markup-version",
  "schema-version",
  "profile",
  "document-id",
  "language",
  "title",
  "subject-id",
  "subject-label",
  "key-stage-id",
  "key-stage-label",
  "year-group-id",
  "year-group-label",
  "target-reading-age",
  "source-system",
  "source-id",
  "source-uri",
  "source-checksum-sha256",
  "producer",
  "producer-version",
]);

function parseFrontmatterField(
  line: string,
  fieldLine: number,
): { key: string; value: string } {
  const separator = line.indexOf(":");
  if (separator < 1) {
    throw invalidMarkup(`Invalid frontmatter line: ${line}`, fieldLine);
  }

  const key = line.slice(0, separator).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(separator + 1).trim());
  } catch {
    throw invalidMarkup(
      `Frontmatter field ${JSON.stringify(key)} must be a quoted JSON string.`,
      fieldLine,
    );
  }

  if (typeof parsed !== "string") {
    throw invalidMarkup(
      `Frontmatter field ${JSON.stringify(key)} must be a quoted string.`,
      fieldLine,
    );
  }

  return { key, value: parsed };
}

function parseFrontmatter(markup: string): ParsedFrontmatter {
  const lines = markup.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") {
    throw invalidMarkup("Resource markup must start with a frontmatter block.", 1);
  }

  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) {
    throw invalidMarkup("Resource markup frontmatter is not closed.", 1);
  }

  const fields: Record<string, string> = {};
  const fieldLines: Record<string, number> = {};
  for (const [offset, line] of lines.slice(1, closingIndex).entries()) {
    if (line.trim().length === 0) {
      continue;
    }

    const fieldLine = offset + 2;
    const { key, value } = parseFrontmatterField(line, fieldLine);
    if (fields[key] !== undefined) {
      throw invalidMarkup(
        `Duplicate frontmatter field ${JSON.stringify(key)}.`,
        fieldLine,
      );
    }
    if (!supportedFrontmatterFields.has(key)) {
      throw invalidMarkup(
        `Unsupported frontmatter field ${JSON.stringify(key)}.`,
        fieldLine,
      );
    }

    fields[key] = value;
    fieldLines[key] = fieldLine;
  }

  return {
    fields,
    fieldLines,
    body: lines.slice(closingIndex + 1),
    bodyOffset: closingIndex + 1,
  };
}

function requireField(fields: Record<string, string>, field: string): string {
  const value = fields[field];
  if (value === undefined || value.length === 0) {
    throw invalidMarkup(`Missing frontmatter field ${JSON.stringify(field)}.`, 1);
  }
  return value;
}

function parseAttributes(source: string | undefined): Record<string, string> {
  if (source === undefined || source.trim().length === 0) {
    return {};
  }

  const attributes: Record<string, string> = {};
  const pattern = /([a-z][a-z0-9-]*)=("(?:[^"\\]|\\.)*")/y;
  let cursor = 0;

  while (cursor < source.length) {
    while (source[cursor] === " ") {
      cursor += 1;
    }
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (!match) {
      throw invalidMarkup(`Invalid directive attributes: ${source}`);
    }

    const key = match[1];
    if (!key || attributes[key] !== undefined) {
      throw invalidMarkup(`Duplicate or invalid directive attribute in: ${source}`);
    }
    attributes[key] = JSON.parse(match[2] ?? "") as string;
    cursor = pattern.lastIndex;
  }

  return attributes;
}

function parseDirective(
  lines: string[],
  startIndex: number,
  lineOffset: number,
): ParsedDirective {
  const opening = lines[startIndex]?.match(directiveOpenPattern);
  if (!opening?.[1]) {
    throw invalidMarkup("Invalid directive opening.");
  }

  let depth = 1;
  let closingIndex = startIndex + 1;
  for (; closingIndex < lines.length; closingIndex += 1) {
    const line = lines[closingIndex];
    if (line === ":::") {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    } else if (line && directiveOpenPattern.test(line)) {
      depth += 1;
    }
  }

  if (closingIndex >= lines.length) {
    throw invalidMarkup(`Directive ${opening[1]} is not closed.`);
  }

  return {
    name: opening[1],
    attributes: parseAttributes(opening[2]),
    inner: lines.slice(startIndex + 1, closingIndex),
    innerOffset: lineOffset + startIndex + 1,
    raw: lines.slice(startIndex, closingIndex + 1).join("\n"),
    line: lineOffset + startIndex + 1,
    nextIndex: closingIndex + 1,
  };
}

function requireAttribute(
  attributes: Record<string, string>,
  attribute: string,
  directive: string,
): string {
  const value = attributes[attribute];
  if (!value) {
    throw invalidMarkup(`${directive} must declare ${JSON.stringify(attribute)}.`);
  }
  return value;
}

function assertAttributes(
  attributes: Record<string, string>,
  supported: readonly string[],
  directive: string,
): void {
  const unsupported = Object.keys(attributes).find(
    (attribute) => !supported.includes(attribute),
  );
  if (unsupported) {
    throw invalidMarkup(
      `${directive} does not support attribute ${JSON.stringify(unsupported)}.`,
    );
  }
}

function optionalEnumAttribute<Value extends string>(
  attributes: Record<string, string>,
  attribute: string,
  allowed: readonly Value[],
  directive: string,
): Value | undefined {
  const value = attributes[attribute];
  if (value === undefined) {
    return undefined;
  }

  if (!(allowed as readonly string[]).includes(value)) {
    throw invalidMarkup(
      `${directive} ${JSON.stringify(attribute)} must be one of ${allowed
        .map((option) => JSON.stringify(option))
        .join(", ")}.`,
    );
  }
  return value as Value;
}

function enumAttribute<Value extends string>(
  attributes: Record<string, string>,
  attribute: string,
  allowed: readonly Value[],
  directive: string,
): Value {
  requireAttribute(attributes, attribute, directive);
  return optionalEnumAttribute(attributes, attribute, allowed, directive) as Value;
}

function parseInteger(value: string, description: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw invalidMarkup(`${description} must be a non-negative integer.`);
  }
  return Number(value);
}

function parseBoundedInteger(
  value: string,
  description: string,
  bounds: { minimum: number; maximum: number },
): number {
  const parsed = parseInteger(value, description);
  if (parsed < bounds.minimum || parsed > bounds.maximum) {
    throw invalidMarkup(
      `${description} must be between ${bounds.minimum} and ${bounds.maximum}.`,
    );
  }
  return parsed;
}

function parsePositiveInteger(value: string, description: string): number {
  const parsed = parseInteger(value, description);
  if (parsed === 0) {
    throw invalidMarkup(`${description} must be a positive integer.`);
  }
  return parsed;
}

function parsePositiveNumber(value: string, description: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw invalidMarkup(`${description} must be a positive number.`);
  }
  return parsed;
}

function parseBoolean(value: string, description: string): boolean {
  if (value !== "true" && value !== "false") {
    throw invalidMarkup(`${description} must be either "true" or "false".`);
  }
  return value === "true";
}

function parseExtensions(
  value: string | undefined,
  description: string,
): NamespacedExtensions | undefined {
  if (value === undefined) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalidMarkup(`${description} extensions must contain JSON.`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalidMarkup(`${description} extensions must contain a JSON object.`);
  }
  return parsed as NamespacedExtensions;
}

/**
 * Reserved, so a generated ID cannot collide with extraction's own and cannot
 * be mistaken for something safe to store as a reference: it is derived from
 * position and content, so surrounding edits change it.
 */
const UNSTABLE_ID_PREFIX = "unstable:";

function nextGeneratedId(state: ParserState, seed: string): string {
  const slug = seed
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 64);
  const base = slug.length > 0 ? slug : "content";
  const count = (state.generatedIds.get(base) ?? 0) + 1;
  state.generatedIds.set(base, count);
  const slugWithOrdinal = count === 1 ? base : `${base}-${count}`;
  return `${UNSTABLE_ID_PREFIX}${slugWithOrdinal}`;
}

function commonNodeFields(
  attributes: Record<string, string>,
  directive: string,
): Pick<ResourceNode, "id"> & Partial<Pick<ResourceNode, "layout" | "extensions">> {
  const id = requireAttribute(attributes, "id", directive);
  const breakBefore = optionalEnumAttribute(
    attributes,
    "break-before",
    layoutBreakSchema.options,
    directive,
  );
  const breakAfter = optionalEnumAttribute(
    attributes,
    "break-after",
    layoutBreakSchema.options,
    directive,
  );
  const preferredWidth = optionalEnumAttribute(
    attributes,
    "preferred-width",
    preferredWidthSchema.options,
    directive,
  );
  const layout = {
    ...(attributes["keep-together"] === undefined
      ? {}
      : {
          keepTogether: parseBoolean(
            attributes["keep-together"],
            `${directive} keep-together`,
          ),
        }),
    ...(attributes["keep-with-next"] === undefined
      ? {}
      : {
          keepWithNext: parseBoolean(
            attributes["keep-with-next"],
            `${directive} keep-with-next`,
          ),
        }),
    ...(breakBefore === undefined ? {} : { breakBefore }),
    ...(breakAfter === undefined ? {} : { breakAfter }),
    ...(preferredWidth === undefined ? {} : { preferredWidth }),
  };
  const extensions = parseExtensions(attributes.extensions, directive);

  return {
    id,
    ...(Object.keys(layout).length === 0 ? {} : { layout }),
    ...(extensions === undefined ? {} : { extensions }),
  };
}

const commonAttributeNames = [
  "id",
  "keep-together",
  "keep-with-next",
  "break-before",
  "break-after",
  "preferred-width",
  "extensions",
] as const;

const figureAttributeNames = [
  "asset-id",
  "media-type",
  "src",
  "width",
  "height",
  "alt-kind",
  "alt",
  "alt-origin",
  "rights",
  "credit",
  "asset-extensions",
] as const;

function parseFigureAsset(attributes: Record<string, string>): Asset {
  const id = requireAttribute(attributes, "asset-id", "oak-figure");
  const alternativeKind = requireAttribute(attributes, "alt-kind", "oak-figure");
  const alternative: Asset["alternative"] = (() => {
    if (alternativeKind === "text") {
      return {
        kind: "text" as const,
        text: requireAttribute(attributes, "alt", "oak-figure"),
        origin: enumAttribute(
          attributes,
          "alt-origin",
          assetAlternativeOriginSchema.options,
          "oak-figure",
        ),
      };
    }
    if (alternativeKind === "decorative") {
      if (attributes.alt !== undefined || attributes["alt-origin"] !== undefined) {
        throw invalidMarkup(
          `oak-figure with alt-kind=${JSON.stringify(alternativeKind)} must not declare alt or alt-origin.`,
        );
      }
      return { kind: "decorative" };
    }
    if (alternativeKind === "missing") {
      if (attributes.alt !== undefined || attributes["alt-origin"] !== undefined) {
        throw invalidMarkup(
          `oak-figure with alt-kind=${JSON.stringify(alternativeKind)} must not declare alt or alt-origin.`,
        );
      }
      return { kind: "missing" };
    }
    throw invalidMarkup(
      'oak-figure alt-kind must be "text", "decorative" or "missing".',
    );
  })();

  const width = attributes.width;
  const height = attributes.height;
  if ((width === undefined) !== (height === undefined)) {
    throw invalidMarkup("oak-figure must declare width and height together.");
  }

  const extensions = parseExtensions(attributes["asset-extensions"], "oak-figure");
  return {
    id,
    mediaType: requireAttribute(attributes, "media-type", "oak-figure"),
    contentRef: requireAttribute(attributes, "src", "oak-figure"),
    alternative,
    ...(width === undefined || height === undefined
      ? {}
      : {
          dimensions: {
            width: parsePositiveNumber(width, "oak-figure width"),
            height: parsePositiveNumber(height, "oak-figure height"),
          },
        }),
    ...(attributes.rights === undefined ? {} : { rights: attributes.rights }),
    ...(attributes.credit === undefined ? {} : { credit: attributes.credit }),
    ...(extensions === undefined ? {} : { extensions }),
  };
}

function registerAsset(state: ParserState, asset: Asset): void {
  const existing = state.assets.get(asset.id);
  if (existing && JSON.stringify(existing) !== JSON.stringify(asset)) {
    throw invalidMarkup(
      `Conflicting metadata was declared for asset ${JSON.stringify(asset.id)}.`,
    );
  }
  state.assets.set(asset.id, asset);
}

type DirectiveHandler = (
  directive: ParsedDirective,
  state: ParserState,
) => ResourceNode | undefined;

function hasContent(inner: readonly string[]): boolean {
  return inner.some((line) => line.trim().length > 0);
}

function calloutDirective(role: CalloutNode["role"] | undefined): DirectiveHandler {
  return ({ attributes, inner, name }) => {
    assertAttributes(
      attributes,
      role === undefined ? [...commonAttributeNames, "role"] : commonAttributeNames,
      name,
    );
    return {
      ...commonNodeFields(attributes, name),
      type: "callout",
      role: role ?? enumAttribute(attributes, "role", calloutRoleSchema.options, name),
      content: parseInlineContent(inner.join("\n")),
    };
  };
}

const directiveHandlers: Record<string, DirectiveHandler> = {
  "oak-answer": (directive, state) => {
    const { attributes, inner, name } = directive;
    assertAttributes(attributes, ["id", "target", "placement", "extensions"], name);
    const extensions = parseExtensions(attributes.extensions, name);
    state.answers.push({
      id: requireAttribute(attributes, "id", name),
      targetId: requireAttribute(attributes, "target", name),
      placement: enumAttribute(
        attributes,
        "placement",
        answerPlacementSchema.options,
        name,
      ),
      content: parseBlocks(inner, state, directive.innerOffset),
      ...(extensions === undefined ? {} : { extensions }),
    } satisfies AnswerAnnotation);
    return undefined;
  },

  "oak-learning-objective": calloutDirective("learning-objective"),
  "oak-instruction": calloutDirective("instruction"),
  "oak-callout": calloutDirective(undefined),

  "oak-section": (directive, state) => {
    const { attributes, inner, name } = directive;
    assertAttributes(attributes, commonAttributeNames, name);
    return {
      ...commonNodeFields(attributes, name),
      type: "section",
      children: parseBlocks(inner, state, directive.innerOffset),
    };
  },

  "oak-question": (directive, state) => {
    const { attributes, inner, name } = directive;
    assertAttributes(attributes, [...commonAttributeNames, "number", "marks"], name);
    return {
      ...commonNodeFields(attributes, name),
      type: "question",
      ...(attributes.number === undefined ? {} : { label: attributes.number }),
      ...(attributes.marks === undefined
        ? {}
        : { marks: parseInteger(attributes.marks, `${name} marks`) }),
      children: parseBlocks(inner, state, directive.innerOffset),
    };
  },

  "oak-answer-space": ({ attributes, inner, name }) => {
    assertAttributes(attributes, [...commonAttributeNames, "kind", "lines"], name);
    if (hasContent(inner)) {
      throw invalidMarkup("oak-answer-space cannot contain child content.");
    }
    return {
      ...commonNodeFields(attributes, name),
      type: "responseSpace",
      kind: enumAttribute(attributes, "kind", responseSpaceKindSchema.options, name),
      ...(attributes.lines === undefined
        ? {}
        : { lines: parsePositiveInteger(attributes.lines, `${name} lines`) }),
    };
  },

  "oak-heading": ({ attributes, inner, name }) => {
    assertAttributes(attributes, [...commonAttributeNames, "level"], name);
    return {
      ...commonNodeFields(attributes, name),
      type: "heading",
      level: parseBoundedInteger(
        requireAttribute(attributes, "level", name),
        `${name} level`,
        HEADING_LEVELS,
      ),
      content: parseInlineContent(inner.join("\n")),
    };
  },

  "oak-paragraph": ({ attributes, inner, name }) => {
    assertAttributes(attributes, commonAttributeNames, name);
    return {
      ...commonNodeFields(attributes, name),
      type: "paragraph",
      content: parseInlineContent(inner.join("\n")),
    };
  },

  "oak-figure": ({ attributes, inner, name }, state) => {
    assertAttributes(
      attributes,
      [...commonAttributeNames, ...figureAttributeNames],
      name,
    );
    const asset = parseFigureAsset(attributes);
    registerAsset(state, asset);
    return {
      ...commonNodeFields(attributes, name),
      type: "figure",
      assetId: asset.id,
      ...(hasContent(inner) ? { caption: parseInlineContent(inner.join("\n")) } : {}),
    };
  },

  "oak-unsupported": ({ attributes, inner, name }) => {
    assertAttributes(
      attributes,
      [...commonAttributeNames, "description", "format", "accessible-text"],
      name,
    );
    return {
      ...commonNodeFields(attributes, name),
      type: "unsupported",
      description: requireAttribute(attributes, "description", name),
      ...(attributes["accessible-text"] === undefined
        ? {}
        : { accessibleText: attributes["accessible-text"] }),
      original: {
        format: requireAttribute(attributes, "format", name),
        value: inner.join("\n"),
      },
    };
  },
};

function preserveUnknownDirective(
  directive: ParsedDirective,
  state: ParserState,
): ResourceNode {
  const { attributes, name } = directive;
  const id = attributes.id ?? nextGeneratedId(state, `unsupported-${name}`);
  state.diagnostics.push({
    category: "unsupported-markup",
    severity: "warning",
    message: `Unsupported extraction directive ${name} was preserved without interpretation.`,
    nodeId: id,
    fallback: "unsupported-node",
    reviewRequired: true,
  });
  return {
    id,
    type: "unsupported",
    description: `Unsupported extraction directive ${name}`,
    original: { format: "oak-mmd", value: directive.raw },
  };
}

function directiveToNode(
  directive: ParsedDirective,
  state: ParserState,
): ResourceNode | undefined {
  const handler = directiveHandlers[directive.name];
  return handler
    ? handler(directive, state)
    : preserveUnknownDirective(directive, state);
}

function assertDirectiveOpening(line: string, blockLine: number): void {
  if (directiveOpenPattern.test(line)) {
    return;
  }

  throw invalidMarkup(
    line === ":::"
      ? "Unexpected directive closing marker."
      : "Malformed or unsupported directive opening.",
    blockLine,
  );
}

function endsParagraph(line: string): boolean {
  return (
    line.trim().length === 0 || line.startsWith(":::") || headingPattern.test(line)
  );
}

function readParagraph(
  lines: string[],
  startIndex: number,
): { text: string; nextIndex: number } {
  let index = startIndex;
  const paragraphLines: string[] = [];

  while (index < lines.length && !endsParagraph(lines[index] ?? "")) {
    paragraphLines.push(lines[index] ?? "");
    index += 1;
  }

  return { text: paragraphLines.join("\n"), nextIndex: index };
}

function parseBlocks(
  lines: string[],
  state: ParserState,
  lineOffset: number,
): ResourceNode[] {
  const nodes: ResourceNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const blockLine = lineOffset + index + 1;
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (line.startsWith(":::")) {
      assertDirectiveOpening(line, blockLine);
      const directive = atLine(blockLine, () =>
        parseDirective(lines, index, lineOffset),
      );
      const node = atLine(directive.line, () => directiveToNode(directive, state));
      if (node) {
        nodes.push(node);
      }
      index = directive.nextIndex;
      continue;
    }

    const heading = headingPattern.exec(line);
    if (heading?.[1] && heading[2]) {
      const headingText = heading[2];
      nodes.push({
        id: nextGeneratedId(state, `heading-${headingText}`),
        type: "heading",
        level: heading[1].length,
        content: atLine(blockLine, () => parseInlineContent(headingText)),
      });
      index += 1;
      continue;
    }

    const paragraph = readParagraph(lines, index);
    nodes.push({
      id: nextGeneratedId(state, `paragraph-${paragraph.text}`),
      type: "paragraph",
      content: atLine(blockLine, () => parseInlineContent(paragraph.text)),
    });
    index = paragraph.nextIndex;
  }

  return nodes;
}

function optionalContext(
  fields: Record<string, string>,
  idField: string,
  labelField: string,
): { id: string; label?: string } | undefined {
  const id = fields[idField];
  if (id === undefined) {
    if (fields[labelField] !== undefined) {
      throw invalidMarkup(`${labelField} requires ${idField}.`);
    }
    return undefined;
  }
  return {
    id,
    ...(fields[labelField] === undefined ? {} : { label: fields[labelField] }),
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

  const title = fields.title;
  const metadata =
    profile === "worksheet.v0"
      ? {
          title: requireField(fields, "title"),
          ...(optionalContext(fields, "subject-id", "subject-label") === undefined
            ? {}
            : { subject: optionalContext(fields, "subject-id", "subject-label") }),
          ...(optionalContext(fields, "key-stage-id", "key-stage-label") === undefined
            ? {}
            : {
                keyStage: optionalContext(fields, "key-stage-id", "key-stage-label"),
              }),
          ...(optionalContext(fields, "year-group-id", "year-group-label") === undefined
            ? {}
            : {
                yearGroup: optionalContext(fields, "year-group-id", "year-group-label"),
              }),
          ...(fields["target-reading-age"] === undefined
            ? {}
            : {
                targetReadingAge: parseInteger(
                  fields["target-reading-age"],
                  "target-reading-age",
                ),
              }),
        }
      : { ...(title === undefined ? {} : { title }) };

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
