import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { devTermsRoute } from "./terms-dev-route";

const teacher = { organisationId: "org-123", teacherId: "user_a" };
const request = (method: string) =>
  new NextRequest("http://localhost:3001/dev/terms", { method });

beforeEach(() => {
  vi.stubEnv("ENABLE_DEV_ROUTES", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the dev terms route", () => {
  it.each([
    ["dev routes are off", { ENABLE_DEV_ROUTES: "" }],
    ["in production", { VERCEL_ENV: "production" }],
  ])("is not found when %s", async (_, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const clear = vi.fn();

    const response = await devTermsRoute(request("DELETE"), {
      authenticate: async () => teacher,
      clear,
    });

    expect(response.status).toBe(404);
    expect(clear).not.toHaveBeenCalled();
  });

  it("asks a signed-out caller to sign in", async () => {
    const clear = vi.fn();

    const response = await devTermsRoute(request("DELETE"), {
      authenticate: async () => null,
      clear,
    });

    expect(response.status).toBe(401);
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears the signed-in teacher's own acceptance", async () => {
    const clear = vi.fn().mockResolvedValue(undefined);

    const response = await devTermsRoute(request("DELETE"), {
      authenticate: async () => teacher,
      clear,
    });

    expect(response.status).toBe(204);
    expect(clear).toHaveBeenCalledWith("user_a");
  });
});
