import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock only the external boundary (Sentry). The logger is the real thing, so
// these tests exercise the actual wiring: initSentry -> setErrorReporter ->
// log.error({ report: true }) -> Sentry.captureException.
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

const DSN = "https://public@o0.ingest.sentry.io/0";

// initSentry mutates the logger's module-level reporter singleton, so each test
// re-imports a fresh module graph shared between initSentry and the logger.
async function loadFresh() {
  vi.resetModules();
  const Sentry = await import("@sentry/nextjs");
  const { initSentry } = await import("./init");
  const { raLogger } = await import("@oaknational/resource-adapter-logger");
  return { Sentry, initSentry, raLogger };
}

describe("initSentry wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("SENTRY_DSN", undefined);
    vi.stubEnv("SENTRY_ENVIRONMENT", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("VERCEL_TARGET_ENV", undefined);
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("initialises Sentry and reports errors when a DSN is set", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    const { Sentry, initSentry, raLogger } = await loadFresh();

    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN }));

    const err = new Error("boom");
    raLogger("capabilities").error(err, { report: true });

    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it("tags events with SENTRY_ENVIRONMENT when set", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    vi.stubEnv("SENTRY_ENVIRONMENT", "staging");
    const { Sentry, initSentry } = await loadFresh();

    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "staging" }),
    );
  });

  it("does nothing and registers no reporter when no DSN is set", async () => {
    const { Sentry, initSentry, raLogger } = await loadFresh();
    initSentry();

    expect(Sentry.init).not.toHaveBeenCalled();

    raLogger("capabilities").error(new Error("boom"), { report: true });

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it.each([
    { environment: "preview", target: "preview" },
    { environment: "preview", target: "staging" },
    { environment: "production", target: "production" },
  ])("throws on $target when no DSN is set", async ({ environment, target }) => {
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("VERCEL_TARGET_ENV", target);
    vi.stubEnv("NODE_ENV", "production");
    const { Sentry, initSentry } = await loadFresh();

    expect(() => initSentry()).toThrow(/SENTRY_DSN is not set/);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("stays quiet in local Vercel development without a DSN", async () => {
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NODE_ENV", "development");
    const { Sentry, initSentry } = await loadFresh();

    expect(() => initSentry()).not.toThrow();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("stays quiet when a served build has no DSN", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { Sentry, initSentry } = await loadFresh();

    expect(() => initSentry()).not.toThrow();
    expect(Sentry.init).not.toHaveBeenCalled();
  });
});
