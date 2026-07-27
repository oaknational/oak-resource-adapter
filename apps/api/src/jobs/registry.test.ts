import { describe, expect, it } from "vitest";

import { isRegisteredJobKind, parseJobInput } from "./registry";

describe("job definition registry", () => {
  it("recognises the typed test job", () => {
    expect(isRegisteredJobKind("test.echo")).toBe(true);
    expect(isRegisteredJobKind("generate.worksheet")).toBe(false);
  });

  it("validates a test job's input", () => {
    expect(parseJobInput("test.echo", { message: "hello" })).toEqual({
      message: "hello",
    });
    expect(() =>
      parseJobInput("test.echo", { message: "hello", unexpected: true }),
    ).toThrow();
  });
});
