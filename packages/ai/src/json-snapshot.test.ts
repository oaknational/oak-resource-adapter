import { describe, expect, it } from "vitest";

import { jsonObjectSnapshot, jsonSnapshot } from "./json-snapshot.js";

describe("jsonSnapshot", () => {
  it("captures the form the payload takes on the wire", () => {
    const snapshot = jsonSnapshot({
      instructions: undefined,
      nested: { at: new Date("2026-07-27T10:00:00.000Z") },
      text: "classify",
    });

    expect(snapshot).toEqual({
      nested: { at: "2026-07-27T10:00:00.000Z" },
      text: "classify",
    });
  });

  it("decouples the snapshot from the payload it was taken of", () => {
    const payload = { text: { verbosity: "low" } };
    const snapshot = jsonSnapshot(payload) as { text: { verbosity: string } };

    payload.text.verbosity = "high";
    expect(snapshot.text.verbosity).toBe("low");
  });

  it("fails rather than record a payload it cannot serialise", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => jsonSnapshot(circular)).toThrow(TypeError);
    expect(() => jsonSnapshot({ tokens: 1n })).toThrow(TypeError);
  });
});

describe("jsonObjectSnapshot", () => {
  it("returns an object payload", () => {
    expect(jsonObjectSnapshot({ model: "gpt-5.6-luna" })).toEqual({
      model: "gpt-5.6-luna",
    });
  });

  it.each([
    ["an array", []],
    ["a primitive", "request"],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(() => jsonObjectSnapshot(value)).toThrow(TypeError);
  });
});
