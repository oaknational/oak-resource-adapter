import { getVercelOidcToken } from "@vercel/oidc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODERATION_CATEGORIES } from "./categories.js";
import { createModerator } from "./moderate.js";
import { ModerationHttpError, type ModerationRequest } from "./types.js";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("@oaknational/resource-adapter-logger", () => ({
  raLogger: () => ({ info: vi.fn(), warn, error: vi.fn(), table: vi.fn() }),
}));

vi.mock("@vercel/oidc", () => ({ getVercelOidcToken: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();
const apiUrl = "https://moderation.test";
const content = "In this practical, pupils heat a solution over a Bunsen burner.";

const scores = Object.fromEntries(
  MODERATION_CATEGORIES.map((category) => [category, 5]),
);

function serviceBody(overrides: Record<string, unknown> = {}) {
  return {
    scores,
    flagged_categories: [],
    prompt_version: "v1.2.3",
    moderation_id: "3f1c2b8e-0000-4000-8000-000000000000",
    ...overrides,
  };
}

function respondWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

function hangUntilAborted() {
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new TypeError("fetch failed", { cause: init.signal?.reason }));
        });
      }),
  );
}

function lastRequest() {
  const [url, init] = fetchMock.mock.lastCall ?? [];
  return {
    url,
    method: init?.method,
    redirect: init?.redirect,
    headers: init?.headers as Record<string, string>,
    body: JSON.parse(String(init?.body)) as unknown,
  };
}

async function moderate(
  request: Partial<ModerationRequest> = {},
  bypassSecret?: string,
) {
  const moderator = createModerator(
    bypassSecret === undefined ? { apiUrl } : { apiUrl, bypassSecret },
  );
  return moderator.moderate({ content, ...request });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(getVercelOidcToken).mockResolvedValue("an-oidc-token");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("createModerator", () => {
  it("rejects a timeout that is not a positive whole number", () => {
    expect(() => createModerator({ apiUrl, timeoutMs: 0 })).toThrow(RangeError);
    expect(() => createModerator({ apiUrl, timeoutMs: 1.5 })).toThrow(RangeError);
  });

  it("rejects a URL that cannot be parsed", () => {
    expect(() => createModerator({ apiUrl: "not a url" })).toThrow(TypeError);
  });
});

describe("moderate request", () => {
  it("posts the content with the OIDC token, bypass secret and snake_case context", async () => {
    respondWith(serviceBody());

    await moderate(
      { context: { sessionId: "session-1", messageId: "message-1" } },
      "bypass",
    );

    expect(lastRequest()).toEqual({
      url: "https://moderation.test/v1/moderate",
      method: "POST",
      redirect: "manual",
      headers: {
        authorization: "Bearer an-oidc-token",
        "content-type": "application/json",
        "x-vercel-protection-bypass": "bypass",
      },
      body: { content, context: { session_id: "session-1", message_id: "message-1" } },
    });
  });

  it("sends no auth or bypass header when neither is available", async () => {
    vi.mocked(getVercelOidcToken).mockRejectedValue(new Error("no token off Vercel"));
    respondWith(serviceBody());

    await moderate();

    expect(lastRequest().headers).toEqual({ "content-type": "application/json" });
  });

  it("leaves out context fields that are not set", async () => {
    respondWith(serviceBody());

    await moderate();
    expect(lastRequest().body).toEqual({ content });

    await moderate({ context: { messageId: "message-1" } });
    expect(lastRequest().body).toEqual({
      content,
      context: { message_id: "message-1" },
    });
  });
});

describe("moderate outcomes", () => {
  it("passes when nothing is flagged", async () => {
    respondWith(serviceBody());

    await expect(moderate()).resolves.toEqual({
      outcome: "PASSED",
      scores,
      promptVersion: "v1.2.3",
      moderationId: "3f1c2b8e-0000-4000-8000-000000000000",
    });
  });

  it("leaves moderationId out when the service did not record one", async () => {
    respondWith(serviceBody({ moderation_id: undefined }));

    const outcome = await moderate();

    expect(outcome).not.toHaveProperty("moderationId");
  });

  it("surfaces the categories the service flagged", async () => {
    respondWith(
      serviceBody({
        flagged_categories: ["p/practical-activities"],
        scores: { ...scores, "p/practical-activities": 2 },
      }),
    );

    await expect(moderate()).resolves.toMatchObject({
      outcome: "FLAGGED",
      flaggedCategories: ["p/practical-activities"],
      unrecognisedCategories: [],
      scores: { "p/practical-activities": 2 },
    });
  });

  it("keeps an unknown flagged code as unrecognised and still flags", async () => {
    respondWith(
      serviceBody({ flagged_categories: ["p/practical-activities", "x/new-category"] }),
    );
    await expect(moderate()).resolves.toMatchObject({
      outcome: "FLAGGED",
      flaggedCategories: ["p/practical-activities"],
      unrecognisedCategories: ["x/new-category"],
    });

    respondWith(serviceBody({ flagged_categories: ["x/new-category"] }));
    await expect(moderate()).resolves.toMatchObject({
      outcome: "FLAGGED",
      flaggedCategories: [],
      unrecognisedCategories: ["x/new-category"],
    });
  });

  it("ignores scores for categories it does not know", async () => {
    respondWith(serviceBody({ scores: { ...scores, "x/new-category": 1 } }));

    const outcome = await moderate();

    expect(outcome).toMatchObject({ outcome: "PASSED", scores });
    expect(outcome).not.toHaveProperty(["scores", "x/new-category"]);
  });
});

describe("moderate failures", () => {
  it.each([
    [400, "INVALID_REQUEST"],
    [401, "NOT_AUTHENTICATED"],
    [403, "NOT_AUTHORISED"],
    [504, "TIMED_OUT"],
    [404, "UPSTREAM_UNAVAILABLE"],
    [429, "UPSTREAM_UNAVAILABLE"],
    [500, "UPSTREAM_UNAVAILABLE"],
    [502, "UPSTREAM_UNAVAILABLE"],
    [503, "UPSTREAM_UNAVAILABLE"],
  ])("maps HTTP %i to %s with the status in the cause", async (status, reason) => {
    respondWith("<html>Gateway Timeout</html>", status);

    const outcome = await moderate();

    expect(outcome).toEqual({
      outcome: "FAILED",
      reason,
      cause: expect.any(ModerationHttpError),
    });
    expect(outcome).toHaveProperty(["cause", "status"], status);
  });

  it("points 401 and 403 at the allowlist and OIDC wiring", async () => {
    respondWith("", 401);
    await expect(moderate()).resolves.toHaveProperty(
      ["cause", "message"],
      expect.stringMatching(/OIDC wiring and the allowlist/),
    );

    respondWith("", 403);
    await expect(moderate()).resolves.toHaveProperty(
      ["cause", "message"],
      expect.stringMatching(/allowlist entry and the OIDC wiring/),
    );
  });

  it.each([
    ["a body that is not JSON", "<html>oops</html>"],
    ["a body missing fields", { flagged_categories: [] }],
    [
      "a score outside 1 to 5",
      serviceBody({ scores: { ...scores, "l/offensive-language": 6 } }),
    ],
    [
      "a score missing for a known category",
      serviceBody({ scores: { ...scores, "e/rshe-content": undefined } }),
    ],
  ])("reports a malformed response for %s", async (_name, body) => {
    respondWith(body);

    await expect(moderate()).resolves.toMatchObject({
      outcome: "FAILED",
      reason: "MALFORMED_RESPONSE",
    });
  });

  it("reports a network failure as upstream unavailable", async () => {
    const networkError = new TypeError("fetch failed");
    fetchMock.mockRejectedValue(networkError);

    await expect(moderate()).resolves.toEqual({
      outcome: "FAILED",
      reason: "UPSTREAM_UNAVAILABLE",
      cause: networkError,
    });
  });

  it("times out after 35 seconds by default", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    hangUntilAborted();

    let settled = false;
    const pending = moderate().finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(34_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({
      outcome: "FAILED",
      reason: "TIMED_OUT",
    });
  });

  it("aborts without calling the service when the signal has already fired", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(moderate({ signal: controller.signal })).resolves.toMatchObject({
      outcome: "FAILED",
      reason: "ABORTED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts a call in flight when the caller's signal fires", async () => {
    const controller = new AbortController();
    hangUntilAborted();

    const pending = moderate({ signal: controller.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      outcome: "FAILED",
      reason: "ABORTED",
    });
  });
});

describe("moderate edge cases", () => {
  it("does not follow a redirect, reporting it with its status", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { location: "https://elsewhere.test/" },
      }),
    );

    const outcome = await moderate({}, "bypass");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(outcome).toMatchObject({
      outcome: "FAILED",
      reason: "UPSTREAM_UNAVAILABLE",
    });
    expect(outcome).toHaveProperty(["cause", "status"], 307);
  });

  it("keeps the status when an error response's body has already failed", async () => {
    const erroredBody = new ReadableStream({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    fetchMock.mockResolvedValue(new Response(erroredBody, { status: 401 }));

    const outcome = await moderate();

    expect(outcome).toMatchObject({ outcome: "FAILED", reason: "NOT_AUTHENTICATED" });
    expect(outcome).toHaveProperty(["cause", "status"], 401);
  });

  it("times out while the OIDC token lookup is still pending", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(getVercelOidcToken).mockReturnValue(new Promise(() => undefined));

    const pending = moderate();
    await vi.advanceTimersByTimeAsync(35_000);

    await expect(pending).resolves.toMatchObject({
      outcome: "FAILED",
      reason: "TIMED_OUT",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts while the OIDC token lookup is still pending", async () => {
    vi.mocked(getVercelOidcToken).mockReturnValue(new Promise(() => undefined));
    const controller = new AbortController();

    const pending = moderate({ signal: controller.signal });
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      outcome: "FAILED",
      reason: "ABORTED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the caller's abort even when fetch only rejects after the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fetchMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new TypeError("fetch failed")), 40_000);
        }),
    );
    const controller = new AbortController();

    const pending = moderate({ signal: controller.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();
    await vi.advanceTimersByTimeAsync(40_000);

    await expect(pending).resolves.toMatchObject({
      outcome: "FAILED",
      reason: "ABORTED",
    });
  });

  it("reports a timeout even when the caller aborts after the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    hangUntilAborted();
    const controller = new AbortController();

    const pending = moderate({ signal: controller.signal });
    await vi.advanceTimersByTimeAsync(35_000);
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      outcome: "FAILED",
      reason: "TIMED_OUT",
    });
  });
});

describe("moderate logging", () => {
  it("logs a failure's reason and status without the content", async () => {
    respondWith("", 503);

    await moderate();

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "Moderation failed: %s (HTTP status %s)",
      "UPSTREAM_UNAVAILABLE",
      503,
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(content);
  });

  it("logs nothing when moderation succeeds", async () => {
    respondWith(serviceBody());

    await moderate();

    expect(warn).not.toHaveBeenCalled();
  });
});
