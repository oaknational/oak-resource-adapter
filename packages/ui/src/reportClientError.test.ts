import { afterEach, describe, expect, it, vi } from "vitest";

const reporting = {
  getToken: async () => "clerk-token",
  trpcEndpoint: "https://resource-adapter-api.example/trpc/v1",
};

const error = Object.assign(new Error("Something broke while rendering"), {
  name: "TypeError",
});

// The module counts reports sent per page load, so each test loads a fresh
// copy rather than sharing that state.
async function loadFresh() {
  vi.resetModules();
  const { reportClientError } = await import("./reportClientError.js");
  return reportClientError;
}

function stubFetchWithReceipt() {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify([{ result: { data: { received: true } } }])),
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reportClientError", () => {
  it("sends the truncated report and host token through tRPC", async () => {
    const reportClientError = await loadFresh();
    const fetchMock = stubFetchWithReceipt();

    await reportClientError({
      componentStack: "at CapabilityList",
      error,
      reporting,
    });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "https://resource-adapter-api.example/trpc/v1/clientErrors.report?batch=1",
    );
    expect(request).toMatchObject({
      body: JSON.stringify({
        "0": {
          errorName: "TypeError",
          errorMessage: "Something broke while rendering",
          componentStack: "at CapabilityList",
        },
      }),
      headers: {
        Authorization: "Bearer clerk-token",
        "x-resource-adapter-contract-version": "1",
      },
      method: "POST",
    });
  });

  it("truncates oversize fields to the contract limits", async () => {
    const reportClientError = await loadFresh();
    const fetchMock = stubFetchWithReceipt();

    await reportClientError({
      componentStack: "s".repeat(5000),
      error: Object.assign(new Error("m".repeat(600)), { name: "E".repeat(150) }),
      reporting,
    });

    const [, request] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String((request as RequestInit).body))["0"];
    expect(payload.errorName).toHaveLength(100);
    expect(payload.errorMessage).toHaveLength(500);
    expect(payload.componentStack).toHaveLength(4000);
  });

  it("defaults an empty error name and omits an absent component stack", async () => {
    const reportClientError = await loadFresh();
    const fetchMock = stubFetchWithReceipt();

    await reportClientError({
      componentStack: null,
      error: Object.assign(new Error("boom"), { name: "  " }),
      reporting,
    });

    const [, request] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String((request as RequestInit).body))["0"];
    expect(payload).toEqual({ errorName: "Error", errorMessage: "boom" });
  });

  it("resolves without throwing when the network fails", async () => {
    const reportClientError = await loadFresh();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(
      reportClientError({ componentStack: null, error, reporting }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing when the API rejects the report", async () => {
    const reportClientError = await loadFresh();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify([{ error: { data: { code: "UNAUTHORIZED" } } }]),
            { status: 401 },
          ),
        ),
    );

    await expect(
      reportClientError({ componentStack: null, error, reporting }),
    ).resolves.toBeUndefined();
  });

  it("omits the Authorization header when no token is available", async () => {
    const reportClientError = await loadFresh();
    const fetchMock = stubFetchWithReceipt();

    await reportClientError({
      componentStack: null,
      error,
      reporting: { ...reporting, getToken: async () => null },
    });

    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect((request as RequestInit).headers).not.toHaveProperty("Authorization");
  });

  it("stops reporting after the per-page-load cap", async () => {
    const reportClientError = await loadFresh();
    const fetchMock = stubFetchWithReceipt();

    for (let i = 0; i < 7; i += 1) {
      await reportClientError({ componentStack: null, error, reporting });
    }

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
