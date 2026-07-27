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
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Factory mocks (Sentry.init/captureException) keep call history across
    // tests by default; clear it so each test starts from zero calls.
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
  });

  afterEach(() => {
    // vi.restoreAllMocks();
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
  });

  it("initialises Sentry and reports errors when a DSN is set", async () => {
    process.env.SENTRY_DSN = DSN;
    const { Sentry, initSentry, raLogger } = await loadFresh();

    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN }));

    const err = new Error("boom");
    raLogger("capabilities").error(err, { report: true });

    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it("tags events with SENTRY_ENVIRONMENT when set", async () => {
    process.env.SENTRY_DSN = DSN;
    process.env.SENTRY_ENVIRONMENT = "staging";
    const { Sentry, initSentry } = await loadFresh();

    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "staging" }),
    );
  });

  it("does nothing and registers no reporter when no DSN is set", async () => {
    const { Sentry, initSentry, raLogger } = await loadFresh();
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    initSentry();

    expect(Sentry.init).not.toHaveBeenCalled();

    raLogger("capabilities").error(new Error("boom"), { report: true });

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("throws in production when no DSN is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { Sentry, initSentry } = await loadFresh();
    expect(() => initSentry()).toThrow(/SENTRY_DSN is not set/);
    expect(Sentry.init).not.toHaveBeenCalled();
  });
});
