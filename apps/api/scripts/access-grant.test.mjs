import { describe, expect, it, vi } from "vitest";

import { clerkInstance, grantAccess, parseAccessArguments } from "./access-grant.mjs";

describe("the access grant arguments", () => {
  it.each([
    [["user_abc"], { access: "full" }],
    [["user_abc", "--revoke"], { access: null }],
    [
      ["user_abc", "--model-jobs-per-24h", "250"],
      { usageLimits: { modelJobsPer24h: 250 } },
    ],
    [
      ["user_abc", "--model-jobs-per-24h", "default"],
      { usageLimits: { modelJobsPer24h: null } },
    ],
  ])("turns %j into a metadata merge", (args, ora) => {
    expect(parseAccessArguments(args)).toEqual({
      privateMetadata: { ora },
      userId: "user_abc",
    });
  });

  it.each([
    [[]],
    [["not-a-user-id"]],
    [["user_abc", "user_def"]],
    [["user_abc", "--model-jobs-per-24h", "0"]],
    [["user_abc", "--model-jobs-per-24h", "1.5"]],
  ])("refuses %j", (args) => {
    expect(() => parseAccessArguments(args)).toThrow();
  });
});

describe("the Clerk instance", () => {
  it("is named from the secret key", () => {
    expect(clerkInstance("sk_test_abc")).toBe("development");
    expect(clerkInstance("sk_live_abc")).toBe("production");
    expect(() => clerkInstance(undefined)).toThrow("CLERK_SECRET_KEY");
  });
});

describe("granting access", () => {
  it("merges the change into the teacher's private metadata", async () => {
    const fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ private_metadata: { ora: { access: "full" } } }),
      ok: true,
    });

    await grantAccess(["user_abc"], {
      env: { CLERK_SECRET_KEY: "sk_test_abc" },
      fetch,
      log: vi.fn(),
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.clerk.com/v1/users/user_abc/metadata",
      expect.objectContaining({
        body: JSON.stringify({ private_metadata: { ora: { access: "full" } } }),
        method: "PATCH",
      }),
    );
  });

  it("reports Clerk's reason for a refusal", async () => {
    const fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ errors: [{ message: "not found" }] }),
      ok: false,
      status: 404,
    });

    await expect(
      grantAccess(["user_abc"], {
        env: { CLERK_SECRET_KEY: "sk_test_abc" },
        fetch,
        log: vi.fn(),
      }),
    ).rejects.toThrow("Clerk refused the update (404): not found");
  });
});
