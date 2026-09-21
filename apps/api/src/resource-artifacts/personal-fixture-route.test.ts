import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { requestAuthenticator } from "../authentication";
import { personalFixture, personalFixtureKey } from "./personal-fixture";
import { personalFixtureRoute } from "./personal-fixture-route";
vi.mock("../authentication", () => ({ requestAuthenticator: vi.fn() }));
vi.mock("./personal-fixture", async (original) => ({
  ...(await original<typeof import("./personal-fixture")>()),
  personalFixture: vi.fn(),
}));
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ENABLE_DEV_ROUTES", "true");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/local_dev");
  for (const key of [
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_TARGET_ENV",
    "CLOUD_SQL_INSTANCE_CONNECTION_NAME",
    "DATABASE_CA_CERT",
  ])
    vi.stubEnv(key, "");
  vi.mocked(requestAuthenticator).mockResolvedValue({
    teacherId: "user_test",
    organisationId: null,
  });
  vi.mocked(personalFixture).mockResolvedValue({
    artifactId: null,
    stored: false,
    ready: false,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each([
  ["NODE_ENV", "production"],
  ["ENABLE_DEV_ROUTES", "false"],
  ["VERCEL", "1"],
  ["DATABASE_URL", "postgresql://localhost:5433/ora"],
  ["DATABASE_URL", "postgresql://remote/local_dev"],
])("closes the route for %s=%s", async (key, value) => {
  vi.stubEnv(key, value);
  expect(
    (
      await personalFixtureRoute(
        new NextRequest("http://localhost/dev/artifact-download-fixture", {
          method: "DELETE",
        }),
      )
    ).status,
  ).toBe(404);
  expect(personalFixture).not.toHaveBeenCalled();
});
it("requires authentication", async () => {
  vi.mocked(requestAuthenticator).mockResolvedValue(null);
  expect(
    (
      await personalFixtureRoute(
        new NextRequest("http://localhost/dev/artifact-download-fixture", {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(401);
  expect(personalFixture).not.toHaveBeenCalled();
});
it.each(["GET", "POST", "DELETE"])(
  "uses the authenticated owner for %s, ignoring supplied identifiers",
  async (method) => {
    const response = await personalFixtureRoute(
      new NextRequest(
        "http://localhost/dev/artifact-download-fixture?teacherId=user_other&key=shared",
        { method },
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(personalFixture).toHaveBeenCalledWith("user_test", method, "local");
  },
);
it("uses a fixed isolated key and rejects path traversal", () => {
  expect(personalFixtureKey("user_test")).toBe(
    "local/_developer-fixtures/user_test/artifact-download/worksheet.docx",
  );
  expect(() => personalFixtureKey("user_../other")).toThrow();
});

it.each(["preview", "staging"])(
  "uses the %s prefix on a deployed API",
  async (target) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_TARGET_ENV", target);
    vi.stubEnv("DATABASE_URL", "postgresql://remote/ora");
    for (const method of ["GET", "POST", "DELETE"]) {
      const response = await personalFixtureRoute(
        new NextRequest(
          "http://localhost/dev/artifact-download-fixture?environment=production",
          { method },
        ),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).environment).toBe(target);
      expect(personalFixture).toHaveBeenLastCalledWith("user_test", method, target);
    }
  },
);
it.each([
  { VERCEL_ENV: "production", VERCEL_TARGET_ENV: "staging" },
  { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "production" },
  { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "unknown" },
  { VERCEL_ENV: "unknown", VERCEL_TARGET_ENV: "" },
])("rejects production and unknown environments: %j", async (env) => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  for (const method of ["GET", "POST", "DELETE", "OPTIONS"]) {
    expect(
      (
        await personalFixtureRoute(
          new NextRequest("http://localhost/dev/artifact-download-fixture", { method }),
        )
      ).status,
    ).toBe(404);
  }
  expect(personalFixture).not.toHaveBeenCalled();
});
