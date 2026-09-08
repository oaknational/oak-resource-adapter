import type { TableCell } from "@oaknational/resource-document";

import { readableMathText } from "./math-text";

export function tableColumnWidths(
  rows: readonly (readonly TableCell[])[],
  width: number,
): number[] {
  // Sizing from the widest row keeps a short or ragged row from producing NaN widths.
  const columns = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const preferred = Array.from({ length: columns }, () => 720);
  if (columns === 0) return [];

  for (const row of rows) {
    row.forEach((cell, column) => {
      if (cell.kind !== "content") return;
      const text = cell.content
        .map((run) => (run.type === "text" ? run.text : readableMathText(run.value)))
        .join("");
      for (const word of text.split(/\s+/u)) {
        // Twips: approximate a wide 11 pt glyph, plus cell margins. Cap outliers such as URLs.
        const estimate = Math.min(2400, Array.from(word).length * 150 + 200);
        preferred[column] = Math.max(preferred[column]!, estimate);
      }
    });
  }

  const total = preferred.reduce((sum, value) => sum + value, 0);
  const widths = preferred.map((value) =>
    Math.floor(
      total <= width
        ? value + (width - total) / preferred.length
        : (value * width) / total,
    ),
  );
  const remainder = width - widths.reduce((sum, value) => sum + value, 0);
  for (let column = 0; column < remainder; column++) widths[column]!++;
  return widths;
}
