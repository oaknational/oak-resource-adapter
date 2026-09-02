import { afterEach, describe, expect, it, vi } from "vitest";

import { newRequestId } from "./requestId.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newRequestId", () => {
  it("returns a distinct v4 identifier each time", () => {
    const first = newRequestId();
    const second = newRequestId();

    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(first).not.toBe(second);
  });

  it("still returns a v4 identifier where randomUUID is unavailable", () => {
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: getRandomValues.bind(globalThis.crypto),
    });

    const identifier = newRequestId();

    expect(identifier).toMatch(UUID_V4);
    expect(identifier).not.toBe(newRequestId());
  });
});
