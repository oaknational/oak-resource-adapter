import type { NamespacedExtensions, ResourceNode } from "../schema/types.js";
import { layoutBreakSchema, preferredWidthSchema } from "../schema/current.js";
import { invalidMarkup } from "./errors.js";

export function parseAttributes(source: string | undefined): Record<string, string> {
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

export function requireAttribute(
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

export function assertAttributes(
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

export function optionalEnumAttribute<Value extends string>(
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

export function enumAttribute<Value extends string>(
  attributes: Record<string, string>,
  attribute: string,
  allowed: readonly Value[],
  directive: string,
): Value {
  requireAttribute(attributes, attribute, directive);
  return optionalEnumAttribute(attributes, attribute, allowed, directive) as Value;
}

export function parseInteger(value: string, description: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw invalidMarkup(`${description} must be a non-negative integer.`);
  }
  return Number(value);
}

export function parseBoundedInteger(
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

export function parsePositiveInteger(value: string, description: string): number {
  const parsed = parseInteger(value, description);
  if (parsed === 0) {
    throw invalidMarkup(`${description} must be a positive integer.`);
  }
  return parsed;
}

export function parsePositiveNumber(value: string, description: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw invalidMarkup(`${description} must be a positive number.`);
  }
  return parsed;
}

export function parseBoolean(value: string, description: string): boolean {
  if (value !== "true" && value !== "false") {
    throw invalidMarkup(`${description} must be either "true" or "false".`);
  }
  return value === "true";
}

export function parseExtensions(
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

export function commonNodeFields(
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

export const commonAttributeNames = [
  "id",
  "keep-together",
  "keep-with-next",
  "break-before",
  "break-after",
  "preferred-width",
  "extensions",
] as const;
