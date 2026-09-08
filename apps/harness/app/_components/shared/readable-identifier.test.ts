import { describe, expect, it } from "vitest";

import { readableIdentifier } from "./readable-identifier";

describe("readableIdentifier", () => {
  it("reads a hyphenated identifier as a sentence", () => {
    expect(readableIdentifier("gaps-in-knowledge")).toBe("Gaps in knowledge");
  });

  it("splits a camel-cased identifier at its word boundary", () => {
    expect(readableIdentifier("worksheetScaffolding")).toBe("Worksheet Scaffolding");
  });

  it("capitalises a single word", () => {
    expect(readableIdentifier("draft")).toBe("Draft");
  });

  it("leaves an empty value alone", () => {
    expect(readableIdentifier("")).toBe("");
  });
});
