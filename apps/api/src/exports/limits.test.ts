import type { ResourceNode } from "@oaknational/resource-document";
import { describe, expect, it, vi } from "vitest";

import { generateDocx } from "./docx";
import {
  documentWith,
  imageDocument,
  inline,
  one,
  paragraph,
  rows,
  setupDocxTests,
  unpack,
} from "./docx.test-support";
import type { ImageLoader } from "./images";
import { ExportLimitError } from "./limits";

setupDocxTests();

describe("DOCX export limits", () => {
  it.each([
    "nodes",
    "depth",
    "response lines",
    "table cells",
    "grid cells",
    "definition entries",
  ] as const)(
    "rejects excessive %s before invoking the image loader",
    async (limit) => {
      const document = imageDocument();
      switch (limit) {
        case "nodes":
          document.content.push(
            ...Array.from({ length: 5000 }, (_, index) =>
              paragraph(`p-${index}`, "Text"),
            ),
          );
          break;
        case "depth": {
          let node = paragraph("leaf", "Deep text");
          for (let index = 0; index < 50; index++) {
            node = { id: `section-${index}`, type: "section", children: [node] };
          }
          document.content.push(node);
          break;
        }
        case "response lines":
          document.content.push({
            id: "response",
            type: "responseSpace",
            kind: "lines",
            lines: 101,
          });
          break;
        case "table cells":
          document.content.push({
            id: "table",
            type: "table",
            role: "test",
            header: Array.from({ length: 200 }, () => ({ kind: "empty" as const })),
            rows: Array.from({ length: 100 }, () =>
              Array.from({ length: 200 }, () => ({ kind: "empty" as const })),
            ),
          });
          break;
        case "grid cells":
          document.content.push(
            ...Array.from({ length: 9 }, (_, index): ResourceNode => ({
              id: `grid-${index}`,
              type: "responseSpace",
              kind: "grid",
              lines: 100,
            })),
          );
          break;
        case "definition entries":
          document.content.push({
            id: "definitions",
            type: "definitionList",
            entries: Array.from({ length: 20_001 }, () => ({ term: inline("Term") })),
          });
          break;
      }
      const imageLoader = vi.fn<ImageLoader>();
      await expect(generateDocx(document, { imageLoader })).rejects.toThrow(
        ExportLimitError,
      );
      expect(imageLoader).not.toHaveBeenCalled();
    },
  );

  it("accepts the response-line boundary", async () => {
    const document = documentWith([
      { id: "response", type: "responseSpace", kind: "lines", lines: 100 },
    ]);
    const { body } = unpack(await generateDocx(document));
    expect(rows(one(body, "w:tbl"))).toHaveLength(100);
  });
});
