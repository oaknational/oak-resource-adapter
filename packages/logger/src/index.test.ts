import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetErrorReporter } from "./index.js";

// The error reporter is a singleton on globalThis, which survives
// vi.resetModules(). Re-importing a fresh module therefore does NOT clear a
// reporter set by an earlier test, so we explicitly reset it after each test.
async function freshLogger() {
  vi.resetModules();
  return import("./index.js");
}

describe("raLogger error reporting", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetErrorReporter();
  });

  it("logs to console.error and does not throw when no reporter is set", async () => {
    const { raLogger } = await freshLogger();
    const log = raLogger("capabilities");
    const err = new Error("boom");

    expect(() => log.error(err)).not.toThrow();
    expect(console.error).toHaveBeenCalledWith(err);
  });

  it("calls the reporter with the error when report is true", async () => {
    const { raLogger, setErrorReporter } = await freshLogger();
    const reporter = vi.fn();
    setErrorReporter(reporter);
    const log = raLogger("capabilities");
    const err = new Error("boom");

    log.error(err, { report: true });

    expect(reporter).toHaveBeenCalledWith(err);
  });

  it("does not throw with report true when no reporter is set", async () => {
    const { raLogger } = await freshLogger();
    const log = raLogger("capabilities");
    const err = new Error("boom");

    expect(() => log.error(err, { report: true })).not.toThrow();
    expect(console.error).toHaveBeenCalledWith(err);
  });

  it("does not call the reporter when report is not requested", async () => {
    const { raLogger, setErrorReporter } = await freshLogger();
    const reporter = vi.fn();
    setErrorReporter(reporter);
    const log = raLogger("capabilities");

    log.error(new Error("boom"));

    expect(reporter).not.toHaveBeenCalled();
  });

  it("swallows a throwing reporter after logging the original error", async () => {
    const { raLogger, setErrorReporter } = await freshLogger();
    const reporter = vi.fn(() => {
      throw new Error("reporter is broken");
    });
    setErrorReporter(reporter);
    const log = raLogger("capabilities");
    const err = new Error("boom");

    expect(() => log.error(err, { report: true })).not.toThrow();
    expect(console.error).toHaveBeenCalledWith(err);
    expect(reporter).toHaveBeenCalledWith(err);
  });

  it("stops calling a previously-set reporter after resetErrorReporter", async () => {
    const { raLogger, setErrorReporter, resetErrorReporter } =
      await freshLogger();
    const reporter = vi.fn();
    setErrorReporter(reporter);
    resetErrorReporter();
    const log = raLogger("capabilities");

    log.error(new Error("boom"), { report: true });

    expect(reporter).not.toHaveBeenCalled();
  });
});

describe("raLogger table", () => {
  beforeEach(() => {
    vi.spyOn(console, "table").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes tabular data through to console.table", async () => {
    const { raLogger } = await freshLogger();
    const log = raLogger("capabilities");
    const rows = [{ id: 1 }, { id: 2 }];

    log.table(rows);

    expect(console.table).toHaveBeenCalledWith(rows, undefined);
  });

  it("forwards the columns argument to console.table", async () => {
    const { raLogger } = await freshLogger();
    const log = raLogger("capabilities");
    const rows = [{ id: 1, name: "a" }];

    log.table(rows, ["id"]);

    expect(console.table).toHaveBeenCalledWith(rows, ["id"]);
  });
});

describe("debug enablement on import", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("enables debug from NEXT_PUBLIC_DEBUG when running in a browser", async () => {
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_DEBUG", "ra:*");
    vi.resetModules();

    const debugModule = await import("debug");
    const enableSpy = vi
      .spyOn(debugModule.default, "enable")
      .mockImplementation(() => {});

    await import("./index.js");

    expect(enableSpy).toHaveBeenCalledWith("ra:*");
  });

  it("does not enable debug when window is undefined", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEBUG", "ra:*");
    vi.resetModules();

    const debugModule = await import("debug");
    const enableSpy = vi
      .spyOn(debugModule.default, "enable")
      .mockImplementation(() => {});

    await import("./index.js");

    expect(enableSpy).not.toHaveBeenCalled();
  });

  it("does not enable debug when NEXT_PUBLIC_DEBUG is unset", async () => {
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_DEBUG", "");
    vi.resetModules();

    const debugModule = await import("debug");
    const enableSpy = vi
      .spyOn(debugModule.default, "enable")
      .mockImplementation(() => {});

    await import("./index.js");

    expect(enableSpy).not.toHaveBeenCalled();
  });
});
