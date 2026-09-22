import { expect, it } from "vitest";

import { attachmentDisposition } from "./attachment-disposition";

it.each([
  [
    '../../Lesson "one"\r\nX-Injected: yes/\\Résumé',
    'attachment; filename="Lesson-one-X-Injected-yes-R-sum.docx"; ' +
      "filename*=UTF-8''Lesson-one-X-Injected-yes-R%C3%A9sum%C3%A9.docx",
  ],
  [
    "数学 🎓",
    'attachment; filename="resource.docx"; ' +
      "filename*=UTF-8''%E6%95%B0%E5%AD%A6.docx",
  ],
  ["a".repeat(200), `attachment; filename="${"a".repeat(100)}.docx"`],
  [
    "Exploring linear equations",
    'attachment; filename="Exploring-linear-equations.docx"',
  ],
])(
  "keeps an untransliterated filename alongside a bounded ASCII one for %s",
  (title, expected) => {
    expect(attachmentDisposition(title, "docx")).toBe(expected);
  },
);

it.each([
  ["a".repeat(99) + "𝒜", "a".repeat(99) + "𝒜"],
  ["a".repeat(99) + "𝒜extra", "a".repeat(99) + "𝒜"],
  ["a".repeat(97) + "数𝒜学尾", "a".repeat(97) + "数𝒜学"],
])(
  "bounds the extended filename to 100 intact code points for %s",
  (title, expectedStem) => {
    const disposition = attachmentDisposition(title, "docx");
    expect(disposition).toMatch(/^attachment; filename="[a-zA-Z0-9_-]+\.docx"; /);
    const encoded = disposition.split("filename*=UTF-8''")[1] ?? "";
    expect(decodeURIComponent(encoded)).toBe(`${expectedStem}.docx`);
  },
);

it.each([null, "", "   ", "///"])(
  "falls back to resource.<extension> for title %j",
  (title) => {
    expect(attachmentDisposition(title, "pdf")).toBe(
      'attachment; filename="resource.pdf"',
    );
  },
);

it.each(["", "do cx", "docx!", "a".repeat(17), "../etc", 'x"'])(
  "refuses the format %j rather than building a header from it",
  (extension) => {
    expect(() => attachmentDisposition("Worksheet", extension)).toThrow(
      "Invalid artifact format.",
    );
  },
);
