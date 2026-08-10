import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelInvocationError } from "@oaknational/resource-adapter-ai";

import { invokeDevSmokeText } from "./dev-invoker";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

// The fake sits at the SDK boundary, so the real invoker, transport and
// recorder all run; only the network call is stubbed.
vi.mock("openai", async (importOriginal) => {
  const original = await importOriginal<typeof import("openai")>();
  return {
    ...original,
    default: vi.fn(function FakeOpenAI() {
      return { responses: { create: createMock } };
    }),
  };
});

function responseFixture() {
  return {
    id: "resp_fake",
    output: [
      {
        content: [{ text: "pong", type: "output_text" }],
        type: "message",
      },
    ],
    output_text: "pong",
    status: "completed",
    usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
  };
}

describe("invokeDevSmokeText", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    createMock.mockReset();
  });

  it("throws a configuration error when the API key is missing", () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    expect(() => invokeDevSmokeText("ping")).toThrow(ModelInvocationError);
    expect(() => invokeDevSmokeText("ping")).toThrow(
      "OPENAI_API_KEY is not configured.",
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("sends a capped request for the bound model and returns the text outcome", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    createMock.mockResolvedValue(responseFixture());

    const result = await invokeDevSmokeText("ping");

    expect(result.outcome).toBe("SUCCESS");
    if (result.outcome === "SUCCESS") {
      expect(result.output).toBe("pong");
    }
    expect(result.meta.providerResponseId).toBe("resp_fake");
    expect(result.meta.usage).toEqual({
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
    });
    expect(createMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        input: "ping",
        max_output_tokens: 256,
        model: "gpt-5.6-luna",
        store: false,
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
