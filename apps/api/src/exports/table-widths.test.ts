import type { TableCell } from "@oaknational/resource-document";
import { describe, expect, it } from "vitest";

import { tableColumnWidths } from "./table-widths";

const cell = (text: string): TableCell => ({
  kind: "content",
  content: [{ type: "text", text }],
});
const blank: TableCell = { kind: "answer" };
const width = 9638;

describe("table column width estimates", () => {
  it("gives row labels room while keeping repeated beat columns equal", () => {
    const widths = tableColumnWidths(
      [
        [cell("Variation"), ...Array.from({ length: 8 }, () => cell("and"))],
        [cell("Habanera"), ...Array<TableCell>(8).fill(blank)],
      ],
      width,
    );
    expect(widths[0]).toBeGreaterThanOrEqual(1550);
    expect(widths.slice(1).every((value) => value >= 720)).toBe(true);
    expect(
      Math.max(...widths.slice(1)) - Math.min(...widths.slice(1)),
    ).toBeLessThanOrEqual(1);
    expect(widths.reduce((sum, value) => sum + value, 0)).toBe(width);
  });

  it("uses words rather than paragraph length or column position", () => {
    const widths = tableColumnWidths(
      [[cell("a short phrase ".repeat(50)), cell("configuration"), blank]],
      width,
    );
    expect(widths[1]).toBeGreaterThan(widths[0]!);
    expect(widths[2]).toBeGreaterThan(720);
  });

  it("measures rendered maths and joins inline runs before finding words", () => {
    expect(
      tableColumnWidths(
        [
          [
            {
              kind: "content",
              content: [{ type: "math", value: String.raw`\times`, display: false }],
            },
            blank,
          ],
        ],
        width,
      ),
    ).toEqual(tableColumnWidths([[cell("×"), blank]], width));
    expect(
      tableColumnWidths(
        [
          [
            {
              kind: "content",
              content: [
                { type: "text", text: "Varia" },
                { type: "text", text: "tion" },
              ],
            },
            blank,
          ],
        ],
        width,
      ),
    ).toEqual(tableColumnWidths([[cell("Variation"), blank]], width));
  });

  it("caps unusually long tokens instead of allowing them to consume the page", () => {
    expect(tableColumnWidths([[cell("x".repeat(200)), blank]], width)).toEqual(
      tableColumnWidths([[cell("x".repeat(2000)), blank]], width),
    );
  });

  it.each([1, 2, 3, 9, 20, 50])(
    "fits %s columns within the available width even when preferred widths cannot fit",
    (columns) => {
      const rows = [
        Array.from({ length: columns }, () => cell("VeryLongUnbreakableToken")),
      ];
      const before = structuredClone(rows);
      const widths = tableColumnWidths(rows, width);
      expect(widths).toHaveLength(columns);
      expect(widths.every((value) => Number.isInteger(value) && value > 0)).toBe(true);
      expect(widths.reduce((sum, value) => sum + value, 0)).toBe(width);
      expect(rows).toEqual(before);
    },
  );

  it("sizes from the widest row so a ragged table still gets whole widths", () => {
    const widths = tableColumnWidths(
      [[cell("One")], [cell("One"), cell("Two"), cell("Three")]],
      width,
    );
    expect(widths).toHaveLength(3);
    expect(widths.every((value) => Number.isInteger(value) && value > 0)).toBe(true);
    expect(widths.reduce((sum, value) => sum + value, 0)).toBe(width);
  });

  it("returns no widths for a table without cells", () => {
    expect(tableColumnWidths([], width)).toEqual([]);
    expect(tableColumnWidths([[]], width)).toEqual([]);
  });

  it("shares space evenly for blank columns", () => {
    const widths = tableColumnWidths([[blank, { kind: "empty" }, blank]], width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });
});
