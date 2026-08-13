import { ResourceDocumentParseError } from "../errors.js";
import type { InlineContent } from "../schema/current.js";

const mathPattern = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;

export function parseInlineContent(value: string): InlineContent {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ResourceDocumentParseError(
      "invalid_markup",
      "Inline markup content must not be empty.",
    );
  }

  const content: InlineContent = [];
  let cursor = 0;

  for (const match of normalized.matchAll(mathPattern)) {
    const index = match.index;
    if (index > cursor) {
      content.push({ type: "text", text: normalized.slice(cursor, index) });
    }

    const displayValue = match[1];
    const inlineValue = match[2];
    content.push({
      type: "math",
      value: (displayValue ?? inlineValue ?? "").trim(),
      display: displayValue !== undefined,
    });
    cursor = index + match[0].length;
  }

  if (cursor < normalized.length) {
    content.push({ type: "text", text: normalized.slice(cursor) });
  }

  return content;
}
