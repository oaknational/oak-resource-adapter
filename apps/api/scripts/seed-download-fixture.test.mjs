import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTeacher, seedSettings } from "./seed-download-fixture.mjs";

const env = {
  DATABASE_URL: "postgresql://test:password@localhost:5432/oak_resource_adapter",
  RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID: "3d0f5051-e6e9-4b27-b9bb-fd011b76370f",
  E2E_CLERK_USER_EMAIL: "test@example.test",
  CLERK_SECRET_KEY: "test-key",
};
afterEach(() => vi.unstubAllGlobals());

describe("local fixture seed configuration", () => {
  it("uses the shared artifact ID without generating another", () => {
    expect(seedSettings(env).artifactId).toBe(
      env.RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID,
    );
  });
  it.each([
    { DATABASE_URL: "postgresql://test:password@remote.example/ora" },
    { DATABASE_URL: "postgresql://test:password@127.0.0.1:5433/ora" },
    { VERCEL: "1" },
    { CLOUD_SQL_INSTANCE_CONNECTION_NAME: "staging-instance" },
    { DATABASE_CA_CERT: "certificate" },
  ])("refuses a deployed database or configuration: %j", (overrides) => {
    expect(() => seedSettings({ ...env, ...overrides })).toThrow(
      "only supports the local",
    );
  });
  it("requires the shared ID and test teacher configuration", () => {
    expect(() =>
      seedSettings({ ...env, RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID: "" }),
    ).toThrow("RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID");
    expect(() => seedSettings({ ...env, E2E_CLERK_USER_EMAIL: "" })).toThrow(
      "E2E_CLERK_USER_EMAIL",
    );
  });
});

it.each([{ body: [{ id: "user_test" }] }, { body: { data: [{ id: "user_test" }] } }])(
  "resolves the existing Clerk teacher using the email filter",
  async ({ body }) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetch);
    expect(await resolveTeacher(seedSettings(env))).toBe("user_test");
    const [url, options] = fetch.mock.calls[0];
    expect(url.searchParams.get("email_address")).toBe(env.E2E_CLERK_USER_EMAIL);
    expect(options.headers.Authorization).toBe("Bearer test-key");
  },
);
it.each([{ body: [] }, { body: [{ id: "user_a" }, { id: "user_b" }] }])(
  "refuses missing or ambiguous teacher results",
  async ({ body }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(resolveTeacher(seedSettings(env))).rejects.toThrow("exactly one");
  },
);
