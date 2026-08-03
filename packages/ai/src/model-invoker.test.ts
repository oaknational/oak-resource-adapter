import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type {
  InvocationRecorder,
  ModelInvocationResponse,
  ModelRole,
  ModelTransport,
  RecordingStage,
} from "./index.js";
import { createModelInvoker, DEFAULT_TIMEOUT_MS, defineRoleBindings } from "./index.js";

const roleBindings = defineRoleBindings({
  "quick-classifier": {
    model: "gpt-5.4-2026-03-05",
    transport: "primary",
  },
});

function responseFixture(): ModelInvocationResponse {
  return {
    id: "response-1",
    output_text: "classified",
    usage: {
      input_tokens: 12,
      output_tokens: 3,
      total_tokens: 15,
    },
  } as unknown as ModelInvocationResponse;
}

function recorderFixture(lifecycle: string[] = []): InvocationRecorder & {
  recordFailed: ReturnType<typeof vi.fn>;
  recordStarted: ReturnType<typeof vi.fn>;
  recordSucceeded: ReturnType<typeof vi.fn>;
} {
  return {
    recordFailed: vi.fn(() => {
      lifecycle.push("failed");
    }),
    recordStarted: vi.fn(() => {
      lifecycle.push("started");
    }),
    recordSucceeded: vi.fn(() => {
      lifecycle.push("succeeded");
    }),
  };
}

describe("createModelInvoker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves model roles as a literal union", () => {
    expectTypeOf<ModelRole<typeof roleBindings>>().toEqualTypeOf<"quick-classifier">();
  });

  it("resolves a role and records a successful invocation", async () => {
    const lifecycle: string[] = [];
    const response = responseFixture();
    const recorder = recorderFixture(lifecycle);
    const transport: ModelTransport = {
      invoke: vi.fn(async () => {
        lifecycle.push("invoke");
        return response;
      }),
    };
    const invoker = createModelInvoker({
      roleBindings,
      recorder,
      transports: { primary: transport },
    });

    await expect(
      invoker.invoke({
        correlationKey: "workflow-step-1",
        request: {
          input: "Classify this resource",
          instructions: "Return the resource type",
        },
        role: "quick-classifier",
      }),
    ).resolves.toBe(response);

    expect(lifecycle).toEqual(["started", "invoke", "succeeded"]);
    expect(transport.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationKey: "workflow-step-1",
        invocationId: expect.any(String),
        model: "gpt-5.4-2026-03-05",
        provider: "openai",
        role: "quick-classifier",
        transport: "primary",
      }),
      expect.anything(),
    );
    expect(recorder.recordSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: expect.any(Number),
        response,
      }),
    );
    expect(recorder.recordFailed).not.toHaveBeenCalled();
  });

  it("carries the prompt template ID through to the recorder", async () => {
    const recorder = recorderFixture();
    const transport: ModelTransport = { invoke: vi.fn(async () => responseFixture()) };
    const invoker = createModelInvoker({
      roleBindings,
      recorder,
      transports: { primary: transport },
    });

    await invoker.invoke({
      promptTemplateId: "template-1",
      request: { input: "Classify this resource" },
      role: "quick-classifier",
    });

    expect(recorder.recordStarted).toHaveBeenCalledWith(
      expect.objectContaining({ promptTemplateId: "template-1" }),
    );
  });

  it("omits the prompt template ID for a call made without a template", async () => {
    const recorder = recorderFixture();
    const transport: ModelTransport = { invoke: vi.fn(async () => responseFixture()) };
    const invoker = createModelInvoker({
      roleBindings,
      recorder,
      transports: { primary: transport },
    });

    await invoker.invoke({
      request: { input: "Classify this resource" },
      role: "quick-classifier",
    });

    expect(recorder.recordStarted.mock.calls[0]?.[0]).not.toHaveProperty(
      "promptTemplateId",
    );
  });

  it("derives the provider from the model rather than the binding", async () => {
    const recorder = recorderFixture();
    const transport: ModelTransport = { invoke: vi.fn(async () => responseFixture()) };
    const invoker = createModelInvoker({
      roleBindings: defineRoleBindings({
        writer: { model: "gpt-5.4-2026-03-05", transport: "primary" },
      }),
      recorder,
      transports: { primary: transport },
    });

    await invoker.invoke({ request: { input: "Write" }, role: "writer" });

    expect(recorder.recordStarted).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-5.4-2026-03-05", provider: "openai" }),
    );
  });

  it("records and preserves a transport failure", async () => {
    const lifecycle: string[] = [];
    const providerError = new Error("Provider unavailable");
    const recorder = recorderFixture(lifecycle);
    const transport: ModelTransport = {
      invoke: vi.fn(async () => {
        lifecycle.push("invoke");
        throw providerError;
      }),
    };
    const invoker = createModelInvoker({
      roleBindings,
      recorder,
      transports: { primary: transport },
    });

    await expect(
      invoker.invoke({
        request: { input: "Classify this resource" },
        role: "quick-classifier",
      }),
    ).rejects.toBe(providerError);

    expect(lifecycle).toEqual(["started", "invoke", "failed"]);
    expect(recorder.recordFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: providerError }),
    );
    expect(recorder.recordSucceeded).not.toHaveBeenCalled();
  });

  describe("recorder resilience", () => {
    it("returns the response when recordSucceeded throws", async () => {
      const response = responseFixture();
      const recorderError = new Error("Recorder unavailable");
      const recorder = recorderFixture();
      recorder.recordSucceeded.mockImplementation(() => {
        throw recorderError;
      });
      const recorderErrors: Array<[unknown, RecordingStage]> = [];
      const invoker = createModelInvoker({
        roleBindings,
        onRecorderError: (error, stage) => {
          recorderErrors.push([error, stage]);
        },
        recorder,
        transports: { primary: { invoke: async () => response } },
      });

      await expect(
        invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
      ).resolves.toBe(response);
      expect(recorderErrors).toEqual([[recorderError, "succeeded"]]);
    });

    it("preserves the provider error when recordFailed throws", async () => {
      const providerError = new Error("Provider unavailable");
      const recorderError = new Error("Recorder unavailable");
      const recorder = recorderFixture();
      recorder.recordFailed.mockImplementation(() => {
        throw recorderError;
      });
      const recorderErrors: Array<[unknown, RecordingStage]> = [];
      const invoker = createModelInvoker({
        roleBindings,
        onRecorderError: (error, stage) => {
          recorderErrors.push([error, stage]);
        },
        recorder,
        transports: {
          primary: {
            invoke: async () => {
              throw providerError;
            },
          },
        },
      });

      await expect(
        invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
      ).rejects.toBe(providerError);
      expect(recorderErrors).toEqual([[recorderError, "failed"]]);
    });

    it("preserves the response when onRecorderError throws", async () => {
      const response = responseFixture();
      const recorder = recorderFixture();
      recorder.recordSucceeded.mockImplementation(() => {
        throw new Error("Recorder unavailable");
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const invoker = createModelInvoker({
        roleBindings,
        onRecorderError: () => {
          throw new Error("Recorder error handler unavailable");
        },
        recorder,
        transports: { primary: { invoke: async () => response } },
      });

      await expect(
        invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
      ).resolves.toBe(response);
      expect(consoleError).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'Model invocation recorder error handler failed while reporting "succeeded".',
        }),
      );
    });

    it("preserves the response when an async onRecorderError rejects", async () => {
      const response = responseFixture();
      const recorder = recorderFixture();
      recorder.recordSucceeded.mockImplementation(() => {
        throw new Error("Recorder unavailable");
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const invoker = createModelInvoker({
        roleBindings,
        onRecorderError: async () => {
          throw new Error("Recorder error handler unavailable");
        },
        recorder,
        transports: { primary: { invoke: async () => response } },
      });

      await expect(
        invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
      ).resolves.toBe(response);
      expect(consoleError).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'Model invocation recorder error handler failed while reporting "succeeded".',
        }),
      );
    });

    it("does not attach the raw recorder error to the default report", async () => {
      const response = responseFixture();
      const recorder = recorderFixture();
      const secret = "SECRET_RECORDER_PAYLOAD";
      recorder.recordSucceeded.mockImplementation(() => {
        throw new Error(secret);
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const invoker = createModelInvoker({
        roleBindings,
        recorder,
        transports: { primary: { invoke: async () => response } },
      });

      await expect(
        invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
      ).resolves.toBe(response);

      const reported = consoleError.mock.calls[0]?.[0];
      expect(reported).toBeInstanceOf(Error);
      expect((reported as Error).message).not.toContain(secret);
      expect((reported as Error & { cause?: unknown }).cause).toBeUndefined();
    });

    it("reports recorder error name, status, and code but not its message", async () => {
      const response = responseFixture();
      const recorder = recorderFixture();
      const secret = "SECRET_RECORDER_PAYLOAD";
      recorder.recordSucceeded.mockImplementation(() => {
        throw Object.assign(new Error(secret), {
          code: "P2002",
          name: "PrismaClientKnownRequestError",
          status: 409,
        });
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const invoker = createModelInvoker({
        roleBindings,
        recorder,
        transports: { primary: { invoke: async () => response } },
      });

      await expect(
        invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
      ).resolves.toBe(response);

      const message = (consoleError.mock.calls[0]?.[0] as Error).message;
      expect(message).toContain("PrismaClientKnownRequestError");
      expect(message).toContain("status 409");
      expect(message).toContain("code P2002");
      expect(message).not.toContain(secret);
    });

    it("fails closed when recordStarted throws", async () => {
      const recorderError = new Error("Recorder unavailable");
      const recorder = recorderFixture();
      recorder.recordStarted.mockImplementation(() => {
        throw recorderError;
      });
      const transport: ModelTransport = {
        invoke: vi.fn(async () => responseFixture()),
      };
      const invoker = createModelInvoker({
        roleBindings,
        recorder,
        transports: { primary: transport },
      });

      await expect(
        invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
      ).rejects.toBe(recorderError);
      expect(transport.invoke).not.toHaveBeenCalled();
    });
  });

  describe("cancellation", () => {
    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
      "rejects invalid per-call timeout %s before recording",
      async (timeoutMs) => {
        const recorder = recorderFixture();
        const transport: ModelTransport = {
          invoke: vi.fn(async () => responseFixture()),
        };
        const invoker = createModelInvoker({
          roleBindings,
          recorder,
          transports: { primary: transport },
        });

        await expect(
          invoker.invoke({
            request: { input: "Classify" },
            role: "quick-classifier",
            timeoutMs,
          }),
        ).rejects.toThrow(RangeError);
        expect(recorder.recordStarted).not.toHaveBeenCalled();
        expect(transport.invoke).not.toHaveBeenCalled();
      },
    );

    it("rejects an invalid default timeout when the invoker is created", () => {
      expect(() =>
        createModelInvoker({
          defaultTimeoutMs: 0,
          roleBindings,
          recorder: recorderFixture(),
          transports: { primary: { invoke: async () => responseFixture() } },
        }),
      ).toThrow(RangeError);
    });

    it("provides every invocation with a default timeout signal", async () => {
      let observed: AbortSignal | undefined;
      const transport: ModelTransport = {
        invoke: async (_invocation, options) => {
          observed = options.signal;
          return responseFixture();
        },
      };
      const invoker = createModelInvoker({
        roleBindings,
        recorder: recorderFixture(),
        transports: { primary: transport },
      });

      await invoker.invoke({
        request: { input: "Classify" },
        role: "quick-classifier",
      });

      expect(observed).toBeInstanceOf(AbortSignal);
      expect(observed?.aborted).toBe(false);
      expect(DEFAULT_TIMEOUT_MS).toBe(60_000);
    });

    it("does not spend the timeout budget on a slow recordStarted", async () => {
      let abortedOnArrival: boolean | undefined;
      const recorder = recorderFixture();
      recorder.recordStarted.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 30)),
      );
      const invoker = createModelInvoker({
        defaultTimeoutMs: 20,
        roleBindings,
        recorder,
        transports: {
          primary: {
            invoke: async (_invocation, options) => {
              abortedOnArrival = options.signal.aborted;
              return responseFixture();
            },
          },
        },
      });

      await invoker.invoke({
        request: { input: "Classify" },
        role: "quick-classifier",
      });

      expect(abortedOnArrival).toBe(false);
    });

    it("forwards the caller's signal and aborts with it", async () => {
      const controller = new AbortController();
      let observed: AbortSignal | undefined;
      const transport: ModelTransport = {
        invoke: async (_invocation, options) => {
          observed = options.signal;
          controller.abort(new Error("Caller cancelled"));
          throw new Error("aborted");
        },
      };
      const invoker = createModelInvoker({
        roleBindings,
        recorder: recorderFixture(),
        transports: { primary: transport },
      });

      await expect(
        invoker.invoke({
          request: { input: "Classify" },
          role: "quick-classifier",
          signal: controller.signal,
        }),
      ).rejects.toThrow("aborted");
      expect(observed?.aborted).toBe(true);
    });

    it("provides a signal that aborts at the configured default timeout", async () => {
      let observed: AbortSignal | undefined;
      const transport: ModelTransport = {
        invoke: async (_invocation, options) => {
          observed = options.signal;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return responseFixture();
        },
      };
      const invoker = createModelInvoker({
        defaultTimeoutMs: 1,
        roleBindings,
        recorder: recorderFixture(),
        transports: { primary: transport },
      });

      await invoker.invoke({
        request: { input: "Classify" },
        role: "quick-classifier",
      });

      expect(observed?.aborted).toBe(true);
      expect((observed?.reason as Error | undefined)?.name).toBe("TimeoutError");
    });

    it("composes a per-call timeout with the caller's signal", async () => {
      const controller = new AbortController();
      let observed: AbortSignal | undefined;
      const transport: ModelTransport = {
        invoke: async (_invocation, options) => {
          observed = options.signal;
          controller.abort(new Error("Caller cancelled"));
          throw new Error("aborted");
        },
      };
      const invoker = createModelInvoker({
        defaultTimeoutMs: 60_000,
        roleBindings,
        recorder: recorderFixture(),
        transports: { primary: transport },
      });

      await expect(
        invoker.invoke({
          request: { input: "Classify" },
          role: "quick-classifier",
          signal: controller.signal,
          timeoutMs: 30_000,
        }),
      ).rejects.toThrow("aborted");
      expect(observed).not.toBe(controller.signal);
      expect(observed?.aborted).toBe(true);
    });
  });
});
