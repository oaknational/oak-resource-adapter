import { describe, expect, it } from "vitest";

import { artifactKey } from "./key.js";

describe("artifactKey", () => {
  it("puts the environment first, so one bucket can serve several", () => {
    expect(
      artifactKey("staging", ["resource-documents", "abc", "worksheet.docx"]),
    ).toBe("staging/resource-documents/abc/worksheet.docx");
  });

  it("keeps each environment's objects apart", () => {
    const segments = ["resource-documents", "abc", "worksheet.docx"];

    expect(artifactKey("preview", segments)).not.toBe(artifactKey("staging", segments));
  });

  it("refuses a key with nothing after the environment", () => {
    expect(() => artifactKey("local", [])).toThrowError("needs a segment");
  });

  it.each([
    { segment: "", reason: "empty" },
    { segment: " padded", reason: "padded" },
    { segment: "with/slash", reason: "a slash" },
    { segment: "with\nnewline", reason: "a control character" },
  ])("refuses $reason in a segment", ({ segment }) => {
    expect(() => artifactKey("local", ["resource-documents", segment])).toThrowError();
  });
});
