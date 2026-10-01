import type { ResourceNode } from "../schema/types.js";
import { parseAttributes } from "./attributes.js";
import { directiveToNode } from "./directives.js";
import { atLine, invalidMarkup } from "./errors.js";
import { nextGeneratedId } from "./generatedIds.js";
import { parseInlineContent } from "./inline.js";
import type { ParsedDirective, ParserState } from "./types.js";

const directiveOpenPattern = /^:::(oak-[a-z0-9-]+)(?:\s+\{(.*)\})?\s*$/;
const headingPattern = /^(#{1,6})\s+(\S.*)$/;

function parseDirective(
  lines: string[],
  startIndex: number,
  lineOffset: number,
): ParsedDirective {
  const opening = lines[startIndex]?.match(directiveOpenPattern);
  if (!opening?.[1]) {
    throw invalidMarkup("Invalid directive opening.");
  }

  const stack = [opening[1]];
  let closingIndex = startIndex + 1;
  for (; closingIndex < lines.length; closingIndex += 1) {
    const line = lines[closingIndex];
    if (line === ":::") {
      stack.pop();
      if (stack.length === 0) {
        break;
      }
    } else if (stack.at(-1) !== "oak-code-block" && line) {
      const nested = directiveOpenPattern.exec(line);
      if (nested?.[1]) {
        stack.push(nested[1]);
      }
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

export function parseBlocks(
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
      const node = atLine(directive.line, () =>
        directiveToNode(directive, state, (child) =>
          parseBlocks(child.inner, state, child.innerOffset),
        ),
      );
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
