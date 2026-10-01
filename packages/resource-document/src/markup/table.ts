import type { TableCell, TableNode } from "../schema/types.js";
import {
  assertAttributes,
  commonAttributeNames,
  commonNodeFields,
  parseBoolean,
} from "./attributes.js";
import { invalidMarkup } from "./errors.js";
import { parseInlineContent } from "./inline.js";
import type { DirectiveHandler } from "./types.js";

function splitRowCells(line: string): string[] {
  const trimmed = line.trim();
  const cells =
    trimmed.length > 1 && trimmed.startsWith("|") && trimmed.endsWith("|")
      ? trimmed.slice(1, -1)
      : trimmed;
  return cells.split("|").map((cell) => cell.trim());
}

function parseTableCell(cell: string): TableCell {
  switch (cell) {
    case "?":
      return { kind: "answer" };
    case "~":
      return { kind: "empty" };
    case "":
      throw invalidMarkup("Use ? for an answer blank or ~ for an empty table cell.");
    default:
      return { kind: "content", content: parseInlineContent(cell) };
  }
}

export function tableDirective(role?: string): DirectiveHandler<TableNode> {
  return ({ attributes, inner, name }) => {
    assertAttributes(attributes, [...commonAttributeNames, "role", "header"], name);
    const hasHeader =
      attributes.header === undefined
        ? true
        : parseBoolean(attributes.header, `${name} header`);
    const rows = inner
      .filter((line) => line.trim().length > 0)
      .map((line) => splitRowCells(line).map(parseTableCell));
    const header = hasHeader ? rows.shift() : undefined;
    if (rows.length === 0) {
      throw invalidMarkup(
        hasHeader
          ? `${name} needs a row of cells beneath its header.`
          : `${name} needs at least one row of cells.`,
      );
    }
    return {
      ...commonNodeFields(attributes, name),
      type: "table",
      role: attributes.role ?? role ?? "table",
      ...(header === undefined ? {} : { header }),
      rows,
    };
  };
}
