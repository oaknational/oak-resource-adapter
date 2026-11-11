import { describe, expect, it, vi } from "vitest";

import { LATEST_ORA_TERMS_VERSION, REQUIRED_ORA_TERMS_VERSION } from "./access";
import { acceptTerms, clearTermsAcceptance, getTermsState } from "./terms";

const teacher = { organisationId: "org-123", teacherId: "user_a" };

describe("ORA's terms", () => {
  it.each([true, false])("reports acceptance as %s", async (termsAccepted) => {
    const access = {
      forget: vi.fn(),
      resolve: vi.fn().mockResolvedValue({ termsAccepted }),
    };

    await expect(getTermsState(teacher, { access })).resolves.toEqual({
      accepted: termsAccepted,
    });
    expect(access.resolve).toHaveBeenCalledWith("user_a");
  });

  it("records the version shown and when it was accepted", async () => {
    const write = vi.fn().mockResolvedValue(undefined);

    await expect(
      acceptTerms({ version: REQUIRED_ORA_TERMS_VERSION }, teacher, {
        now: () => new Date("2026-11-11T10:00:00.000Z"),
        write,
      }),
    ).resolves.toEqual({ accepted: true });
    expect(write).toHaveBeenCalledWith("user_a", {
      acceptedTerms: {
        version: REQUIRED_ORA_TERMS_VERSION,
        acceptedAt: "2026-11-11T10:00:00.000Z",
      },
    });
  });

  it.each([
    ["older than ORA requires", REQUIRED_ORA_TERMS_VERSION - 1],
    ["newer than ORA knows", LATEST_ORA_TERMS_VERSION + 1],
  ])("records nothing for a version %s", async (_, version) => {
    const write = vi.fn();

    await expect(
      acceptTerms({ version }, teacher, { now: () => new Date(), write }),
    ).resolves.toEqual({ accepted: false });
    expect(write).not.toHaveBeenCalled();
  });

  it("clears acceptance, then forgets the cached access", async () => {
    const calls: string[] = [];
    const write = vi.fn(async () => {
      calls.push("write");
    });
    const forget = vi.fn(() => {
      calls.push("forget");
    });

    await clearTermsAcceptance("user_a", {
      access: { forget, resolve: vi.fn() },
      write,
    });
    expect(write).toHaveBeenCalledWith("user_a", { acceptedTerms: null });
    expect(forget).toHaveBeenCalledWith("user_a");
    expect(calls).toEqual(["write", "forget"]);
  });
});
