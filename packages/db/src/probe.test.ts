import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { probeDatabase } from "./probe.js";

const { query, connect, release, getDatabaseClient } = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  getDatabaseClient: vi.fn(),
}));

vi.mock("./client.js", () => ({ getDatabaseClient }));

function driverError(code: string): Error {
  return Object.assign(new Error("the driver said so"), { code });
}

beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue({ rows: [{ 1: 1 }] });
  connect.mockResolvedValue({ query, release });
  getDatabaseClient.mockReturnValue({ $client: { connect } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("probeDatabase", () => {
  it("resolves null when the database answers", async () => {
    await expect(probeDatabase()).resolves.toBeNull();
    expect(query.mock.calls[0]?.[0]).toMatchObject({ text: "select 1" });
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([
    { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE", failure: "certificate-rejected" },
    { code: "SELF_SIGNED_CERT_IN_CHAIN", failure: "certificate-rejected" },
    { code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", failure: "certificate-rejected" },
    { code: "CERT_HAS_EXPIRED", failure: "certificate-rejected" },
    { code: "28P01", failure: "refused" },
    { code: "3D000", failure: "refused" },
    { code: "42501", failure: "refused" },
    { code: "ETIMEDOUT", failure: "unavailable" },
    { code: "ECONNREFUSED", failure: "unavailable" },
    { code: "57P03", failure: "unavailable" },
  ])("reads a Drizzle-wrapped $code as $failure", async ({ code, failure }) => {
    query.mockRejectedValue(driverError(code));

    await expect(probeDatabase()).resolves.toBe(failure);
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("reports configuration failure before trying to acquire a connection", async () => {
    getDatabaseClient.mockImplementation(() => {
      throw new Error("DATABASE_CA_CERT is required");
    });

    await expect(probeDatabase()).resolves.toBe("not-configured");
    expect(connect).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("reads an unrecognised code as unavailable", async () => {
    query.mockRejectedValue(driverError("42P01"));

    await expect(probeDatabase()).resolves.toBe("unavailable");
  });

  it("keeps a codeless query failure retryable", async () => {
    query.mockRejectedValue(new Error("connection terminated"));

    await expect(probeDatabase()).resolves.toBe("unavailable");
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("follows nested error causes", async () => {
    query.mockRejectedValue(new Error("wrapper", { cause: driverError("28P01") }));

    await expect(probeDatabase()).resolves.toBe("refused");
  });

  it("stops following circular error causes", async () => {
    const error = new Error("circular");
    error.cause = error;
    query.mockRejectedValue(error);

    await expect(probeDatabase()).resolves.toBe("unavailable");
  });

  it.each([
    { error: driverError("28P01"), failure: "refused" },
    { error: driverError("ECONNREFUSED"), failure: "unavailable" },
    { error: driverError("CERT_HAS_EXPIRED"), failure: "certificate-rejected" },
    {
      error: new Error("timeout exceeded when trying to connect"),
      failure: "unavailable",
    },
  ])(
    "classifies acquisition failure as $failure without releasing an unowned client",
    async ({ error, failure }) => {
      connect.mockRejectedValue(error);

      await expect(probeDatabase()).resolves.toBe(failure);
      expect(query).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    },
  );

  it("destroys a timed-out connection and permits the next probe to succeed", async () => {
    vi.useFakeTimers();
    let rejectQuery: (error: Error) => void = () => undefined;
    query.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectQuery = reject;
      }),
    );

    const probe = probeDatabase();
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(probe).resolves.toBe("unavailable");
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
    rejectQuery(new Error("connection terminated"));
    await expect(probeDatabase()).resolves.toBeNull();
    expect(release).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the query timer on success", async () => {
    vi.useFakeTimers();

    await expect(probeDatabase()).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(release).toHaveBeenCalledExactlyOnceWith(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
