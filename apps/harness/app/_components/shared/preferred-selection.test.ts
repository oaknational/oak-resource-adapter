import { describe, expect, it } from "vitest";

import { preferredSelection } from "./preferred-selection";

describe("preferredSelection", () => {
  it("takes the requested selection when the catalogue offers it", () => {
    expect(preferredSelection("second", "first", ["first", "second"])).toBe("second");
  });

  it("ignores a requested selection the catalogue does not offer", () => {
    expect(preferredSelection("absent", "first", ["first", "second"])).toBe("first");
  });

  it("keeps the current selection when nothing was requested", () => {
    expect(preferredSelection(undefined, "second", ["first", "second"])).toBe("second");
  });

  it("falls back to the first entry when the current selection has gone", () => {
    expect(preferredSelection(undefined, "stale", ["first", "second"])).toBe("first");
  });

  it("selects nothing when the catalogue is empty", () => {
    expect(preferredSelection("first", "first", [])).toBe("");
  });
});
