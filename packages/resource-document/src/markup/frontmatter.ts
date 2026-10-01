import { invalidMarkup } from "./errors.js";

interface ParsedFrontmatter {
  fields: Record<string, string>;
  fieldLines: Record<string, number>;
  body: string[];
  bodyOffset: number;
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

export function parseFrontmatter(markup: string): ParsedFrontmatter {
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

export function requireField(fields: Record<string, string>, field: string): string {
  const value = fields[field];
  if (value === undefined || value.length === 0) {
    throw invalidMarkup(`Missing frontmatter field ${JSON.stringify(field)}.`, 1);
  }
  return value;
}

export function optionalContext(
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
