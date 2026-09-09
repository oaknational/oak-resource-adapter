import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchApiHealth, fetchApiReadiness } from "./harness-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

const readyBody = {
  status: "ready",
  checks: {
    modelConfiguration: {
      label: "Model configuration",
      status: "ready",
      message: "Deterministic transport configured.",
    },
  },
};

function notReadyBody(code: string, message: string) {
  return {
    status: "not-ready",
    checks: {
      modelConfiguration: {
        label: "Model configuration",
        status: "not-ready",
        code,
        message,
      },
    },
  };
}

describe("fetchApiReadiness", () => {
  it.each(["OpenAI", "Deterministic"])(
    "reads ready %s configuration without caching and forwards cancellation",
    async (transport) => {
      const body = {
        ...readyBody,
        checks: {
          modelConfiguration: {
            ...readyBody.checks.modelConfiguration,
            message: `${transport} transport configured.`,
          },
        },
      };
      respond(Response.json(body));
      const controller = new AbortController();

      await expect(fetchApiReadiness(controller.signal)).resolves.toEqual(body);
      expect(fetch).toHaveBeenCalledWith("/adapter-proxy/health/ready", {
        cache: "no-store",
        signal: controller.signal,
      });
    },
  );

  it.each([
    ["MISSING_OPENAI_API_KEY", "OPENAI_API_KEY is not configured."],
    ["UNKNOWN_MODEL_TRANSPORT", "MODEL_TRANSPORT must be openai or deterministic."],
    [
      "DETERMINISTIC_TRANSPORT_FORBIDDEN",
      "Deterministic model transport is not allowed in production.",
    ],
  ])("reads a legitimate 503 configuration failure: %s", async (code, message) => {
    const body = notReadyBody(code, message);
    respond(Response.json(body, { status: 503 }));

    await expect(fetchApiReadiness(new AbortController().signal)).resolves.toEqual(
      body,
    );
  });

  it.each([
    { status: 200, readiness: "ready" },
    { status: 503, readiness: "not-ready" },
  ])(
    "accepts generic future checks with HTTP $status",
    async ({ status, readiness }) => {
      const body = {
        status: readiness,
        checks: {
          futureCatalogue: {
            label: "Curriculum catalogue",
            status: readiness,
            message: "Curriculum catalogue configuration checked.",
          },
          futureStorage: {
            label: "Export storage",
            status: "ready",
            message: "Export storage configured.",
            code: "FUTURE_CHECK_READY",
          },
        },
      };
      respond(Response.json(body, { status }));

      await expect(fetchApiReadiness(new AbortController().signal)).resolves.toEqual(
        body,
      );
    },
  );

  it.each([404, 500])("rejects unavailable HTTP %s", async (status) => {
    respond(Response.json(readyBody, { status }));

    await expect(fetchApiReadiness(new AbortController().signal)).rejects.toThrow(
      "The readiness endpoint is unavailable.",
    );
  });

  it.each([
    { name: "malformed body", status: 200, body: "not JSON health data" },
    {
      name: "missing check fields",
      status: 200,
      body: { status: "ready", checks: { modelConfiguration: { status: "ready" } } },
    },
    {
      name: "empty ready checks",
      status: 200,
      body: { status: "ready", checks: {} },
    },
    {
      name: "empty not-ready checks",
      status: 503,
      body: { status: "not-ready", checks: {} },
    },
    {
      name: "ready overall with a failed check",
      status: 200,
      body: {
        ...notReadyBody("MISSING_OPENAI_API_KEY", "OPENAI_API_KEY is not configured."),
        status: "ready",
      },
    },
    {
      name: "not-ready overall with all checks ready",
      status: 503,
      body: { ...readyBody, status: "not-ready" },
    },
  ])("rejects $name", async ({ status, body }) => {
    respond(Response.json(body, { status }));

    await expect(fetchApiReadiness(new AbortController().signal)).rejects.toThrow(
      "The API returned readiness in an unrecognised shape.",
    );
  });

  it.each([
    { status: 503, body: readyBody },
    {
      status: 200,
      body: notReadyBody("MISSING_OPENAI_API_KEY", "OPENAI_API_KEY is not configured."),
    },
  ])(
    "rejects HTTP $status inconsistent with overall readiness",
    async ({ status, body }) => {
      respond(Response.json(body, { status }));

      await expect(fetchApiReadiness(new AbortController().signal)).rejects.toThrow(
        "The readiness response is inconsistent.",
      );
    },
  );

  it.each([200, 503])("rejects invalid JSON with HTTP %s", async (status) => {
    respond(new Response("{invalid", { status }));

    await expect(fetchApiReadiness(new AbortController().signal)).rejects.toThrow(
      SyntaxError,
    );
  });

  it("propagates network failures", async () => {
    const error = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

    await expect(fetchApiReadiness(new AbortController().signal)).rejects.toBe(error);
  });
});

describe("fetchApiHealth", () => {
  it("reads healthy liveness without caching and forwards cancellation", async () => {
    respond(Response.json({ status: "ok" }));
    const controller = new AbortController();

    await expect(fetchApiHealth(controller.signal)).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith("/adapter-proxy/health", {
      cache: "no-store",
      signal: controller.signal,
    });
  });

  it.each([404, 500, 503])("returns false for HTTP %s", async (status) => {
    respond(Response.json({ status: "ok" }, { status }));

    await expect(fetchApiHealth(new AbortController().signal)).resolves.toBe(false);
  });

  it.each([{ status: "unexpected" }, {}, "not JSON health data", null])(
    "returns false for an invalid liveness body: %j",
    async (body) => {
      respond(Response.json(body));

      await expect(fetchApiHealth(new AbortController().signal)).resolves.toBe(false);
    },
  );

  it("rejects invalid JSON", async () => {
    respond(new Response("{invalid"));

    await expect(fetchApiHealth(new AbortController().signal)).rejects.toThrow(
      SyntaxError,
    );
  });

  it("propagates network failures", async () => {
    const error = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

    await expect(fetchApiHealth(new AbortController().signal)).rejects.toBe(error);
  });
});
