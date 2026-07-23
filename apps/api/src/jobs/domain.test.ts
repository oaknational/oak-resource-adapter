import { describe, expect, it } from "vitest";

import { idempotencyKeySchema, jobFailureSchema, jobIdSchema } from "./domain";

describe("job domain schemas", () => {
  it("rejects a malformed job id at the HTTP boundary", () => {
    expect(jobIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("trims idempotency keys and enforces length bounds", () => {
    expect(idempotencyKeySchema.parse("  request-1  ")).toBe("request-1");
    expect(idempotencyKeySchema.safeParse("").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("validates a failure and rejects an incomplete one", () => {
    expect(jobFailureSchema.parse({ code: "boom", message: "It failed." })).toEqual({
      code: "boom",
      message: "It failed.",
    });
    expect(jobFailureSchema.safeParse({ code: "boom" }).success).toBe(false);
    expect(
      jobFailureSchema.safeParse({ code: "", message: "empty code" }).success,
    ).toBe(false);
  });
});
