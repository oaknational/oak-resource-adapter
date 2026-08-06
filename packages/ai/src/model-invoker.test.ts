import { z } from "zod";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type {
  InvocationRecorder,
  JsonObject,
  ModelInvocationResponse,
  ModelResponseOutput,
  ModelRole,
  ModelTransport,
  ModelTransportOptions,
  ModelTransportInvocation,
  RecordingStage,
  StructuredModelOutputResult,
} from "./index.js";
import {
  createModelInvoker,
  DEFAULT_TIMEOUT_MS,
  defineRoleBindings,
  ModelInvocationError,
} from "./index.js";

const roleBindings = defineRoleBindings({
  "quick-classifier": {
    model: "gpt-5.6-luna",
    transport: "primary",
  },
});

function responseFixture(
  output: ModelResponseOutput = { kind: "TEXT", text: "classified" },
): ModelInvocationResponse {
  return {
    output,
    providerResponseId: "response-1",
    rawResponse: { id: "response-1" },
    usage: {
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
    },
  };
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

function transportFixture(
  run: (
    options: ModelTransportOptions,
  ) => Promise<ModelInvocationResponse> = async () => responseFixture(),
  lifecycle: string[] = [],
): Readonly<{
  execute: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
  transport: ModelTransport;
}> {
  const execute = vi.fn(async (options: ModelTransportOptions) => {
    lifecycle.push("execute");
    return { kind: "SUCCESS" as const, response: await run(options) };
  });
  const prepare = vi.fn((invocation: ModelTransportInvocation) => ({
    execute,
    request: {
      ...(invocation.request as unknown as JsonObject),
      model: invocation.model,
    },
  }));
  return { execute, prepare, transport: { prepare } };
}

function invokerFixture(
  recorder = recorderFixture(),
  transport = transportFixture().transport,
) {
  return createModelInvoker({
    roleBindings,
    recorder,
    transports: { primary: transport },
  });
}

describe("createModelInvoker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves model roles as a literal union", () => {
    expectTypeOf<ModelRole<typeof roleBindings>>().toEqualTypeOf<"quick-classifier">();
  });

  it("prepares, records, executes, and records success in order", async () => {
    const lifecycle: string[] = [];
    const response = responseFixture();
    const recorder = recorderFixture(lifecycle);
    const transport = transportFixture(async () => response, lifecycle);
    transport.prepare.mockImplementationOnce((invocation: ModelTransportInvocation) => {
      lifecycle.push("prepare");
      return {
        execute: transport.execute,
        request: {
          input: "Classify this resource",
          model: invocation.model,
          providerField: true,
        },
      };
    });
    const invoker = invokerFixture(recorder, transport.transport);

    await expect(
      invoker.invoke({
        correlationKey: "workflow-step-1",
        promptTemplateId: "template-1",
        request: { input: "Classify this resource" },
        role: "quick-classifier",
      }),
    ).resolves.toBe(response);

    expect(lifecycle).toEqual(["prepare", "started", "execute", "succeeded"]);
    expect(transport.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationKey: "workflow-step-1",
        invocationId: expect.any(String),
        model: "gpt-5.6-luna",
        promptTemplateId: "template-1",
        provider: "openai",
        role: "quick-classifier",
        transport: "primary",
      }),
      { kind: "PROVIDER_DEFAULT" },
    );
    expect(recorder.recordStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          input: "Classify this resource",
          model: "gpt-5.6-luna",
          providerField: true,
        },
      }),
    );
    expect(recorder.recordSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ response }),
    );
    expect(recorder.recordFailed).not.toHaveBeenCalled();
  });

  it("omits optional correlation metadata when it was not supplied", async () => {
    const recorder = recorderFixture();
    await invokerFixture(recorder).invoke({
      request: { input: "Classify" },
      role: "quick-classifier",
    });

    const started = recorder.recordStarted.mock.calls[0]?.[0];
    expect(started).not.toHaveProperty("correlationKey");
    expect(started).not.toHaveProperty("promptTemplateId");
  });

  it("normalises provider failures and records the stable error", async () => {
    const providerError = Object.assign(new Error("secret provider detail"), {
      status: 429,
    });
    const recorder = recorderFixture();
    const transport = transportFixture(async () => {
      throw providerError;
    });
    const invocation = invokerFixture(recorder, transport.transport).invoke({
      request: { input: "Classify" },
      role: "quick-classifier",
    });

    await expect(invocation).rejects.toMatchObject({
      cause: providerError,
      code: "RATE_LIMITED",
      message: "The model provider rate-limited the invocation.",
      retryable: true,
      status: 429,
    });
    expect(recorder.recordFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "RATE_LIMITED" }),
      }),
    );
  });

  it("records response data from a provider-returned failure", async () => {
    const error = new ModelInvocationError({
      code: "PROVIDER_UNAVAILABLE",
      providerCode: "server_error",
    });
    const response = {
      providerResponseId: "response-failed-1",
      rawResponse: { error: { code: "server_error" }, id: "response-failed-1" },
      usage: { inputTokens: 12, outputTokens: 1, totalTokens: 13 },
    } as const;
    const recorder = recorderFixture();
    const transport: ModelTransport = {
      prepare(invocation) {
        return {
          execute: async () => ({ error, kind: "FAILURE", response }),
          request: invocation.request as unknown as JsonObject,
        };
      },
    };

    await expect(
      invokerFixture(recorder, transport).invoke({
        request: { input: "Classify" },
        role: "quick-classifier",
      }),
    ).rejects.toBe(error);
    expect(recorder.recordFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error, response }),
    );
    expect(recorder.recordSucceeded).not.toHaveBeenCalled();
  });

  describe("output methods", () => {
    it("returns the convenience text result and owns the text format", async () => {
      const transport = transportFixture();
      const result = await invokerFixture(
        recorderFixture(),
        transport.transport,
      ).invokeText({
        request: { input: "Classify", text: { verbosity: "low" } },
        role: "quick-classifier",
      });

      expect(result).toMatchObject({ outcome: "SUCCESS", output: "classified" });
      expect(transport.prepare).toHaveBeenCalledWith(expect.anything(), {
        kind: "TEXT",
      });
    });

    it("carries the recorded invocation and its usage on every outcome", async () => {
      const recorder = recorderFixture();
      const transport = transportFixture(async () =>
        responseFixture({ kind: "REFUSAL", refusal: "I cannot do that" }),
      );
      const result = await invokerFixture(recorder, transport.transport).invokeText({
        request: { input: "Classify" },
        role: "quick-classifier",
      });

      const started = recorder.recordStarted.mock.calls[0]?.[0] as {
        invocationId: string;
      };
      expect(result.meta).toEqual({
        invocationId: started.invocationId,
        providerResponseId: "response-1",
        usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
      });
    });

    it("omits response metadata a transport did not report", async () => {
      const transport = transportFixture(async () => ({
        output: { kind: "TEXT", text: "classified" },
        rawResponse: {},
      }));
      const { meta } = await invokerFixture(
        recorderFixture(),
        transport.transport,
      ).invokeText({ request: { input: "Classify" }, role: "quick-classifier" });

      expect(meta).not.toHaveProperty("providerResponseId");
      expect(meta).not.toHaveProperty("usage");
    });

    it.each([
      [
        { kind: "REFUSAL", refusal: "I cannot do that" } as const,
        { outcome: "REFUSAL", refusal: "I cannot do that" },
      ],
      [
        { kind: "INCOMPLETE", reason: "MAX_OUTPUT_TOKENS" } as const,
        { outcome: "INCOMPLETE", reason: "MAX_OUTPUT_TOKENS" },
      ],
      [{ kind: "MISSING" } as const, { outcome: "OUTPUT_MISSING" }],
    ])("returns a branchable %s output state", async (output, expected) => {
      const transport = transportFixture(async () => responseFixture(output));
      await expect(
        invokerFixture(recorderFixture(), transport.transport).invokeText({
          request: { input: "Classify" },
          role: "quick-classifier",
        }),
      ).resolves.toMatchObject(expected);
    });

    it("infers and returns schema output", async () => {
      const schema = z.object({ confidence: z.number(), label: z.string() });
      const transport = transportFixture(async () =>
        responseFixture({
          kind: "TEXT",
          text: '{"value":{"confidence":0.9,"label":"worksheet"}}',
        }),
      );
      const invocation = invokerFixture(
        recorderFixture(),
        transport.transport,
      ).invokeStructured({
        request: { input: "Classify" },
        role: "quick-classifier",
        schema,
        schemaName: "resource_classification",
      });
      expectTypeOf(invocation).toEqualTypeOf<
        Promise<StructuredModelOutputResult<{ confidence: number; label: string }>>
      >();

      await expect(invocation).resolves.toMatchObject({
        outcome: "SUCCESS",
        output: { confidence: 0.9, label: "worksheet" },
      });

      const requirement = transport.prepare.mock.calls[0]?.[1] as {
        kind: string;
        name: string;
        schema: z.ZodType;
      };
      expect(requirement).toMatchObject({
        kind: "STRUCTURED",
        name: "resource_classification",
      });
      expect(
        requirement.schema.safeParse({ value: { confidence: 0.9, label: "worksheet" } })
          .success,
      ).toBe(true);
      expect(
        requirement.schema.safeParse({ confidence: 0.9, label: "worksheet" }).success,
      ).toBe(false);
    });

    it("wraps a primitive schema so it still reaches the provider object-rooted", async () => {
      const transport = transportFixture(async () =>
        responseFixture({ kind: "TEXT", text: '{"value":"worksheet"}' }),
      );
      const result = await invokerFixture(
        recorderFixture(),
        transport.transport,
      ).invokeStructured({
        request: { input: "Classify" },
        role: "quick-classifier",
        schema: z.string(),
        schemaName: "classification",
      });

      expect(result).toMatchObject({ outcome: "SUCCESS", output: "worksheet" });
    });

    it.each([
      ["not json", "INVALID_JSON"],
      ['{"value":{"label":42}}', "SCHEMA_MISMATCH"],
      ['{"value":{"label":"ok"},"extra":1}', "SCHEMA_MISMATCH"],
    ] as const)(
      "contains structured validation failure for %s",
      async (text, reason) => {
        const recorder = recorderFixture();
        const transport = transportFixture(async () =>
          responseFixture({ kind: "TEXT", text }),
        );
        const result = await invokerFixture(
          recorder,
          transport.transport,
        ).invokeStructured({
          request: { input: "Classify" },
          role: "quick-classifier",
          schema: z.object({ label: z.string() }),
          schemaName: "classification",
        });

        expect(result).toMatchObject({
          outcome: "STRUCTURED_OUTPUT_FAILURE",
          reason,
        });
        expect(recorder.recordSucceeded).toHaveBeenCalledWith(
          expect.objectContaining({ outputValidationStatus: reason }),
        );
        expect(recorder.recordFailed).not.toHaveBeenCalled();
      },
    );

    it("records VALID when the output validates", async () => {
      const recorder = recorderFixture();
      const transport = transportFixture(async () =>
        responseFixture({ kind: "TEXT", text: '{"value":{"label":"ok"}}' }),
      );
      await invokerFixture(recorder, transport.transport).invokeStructured({
        request: { input: "Classify" },
        role: "quick-classifier",
        schema: z.object({ label: z.string() }),
        schemaName: "classification",
      });

      expect(recorder.recordSucceeded).toHaveBeenCalledWith(
        expect.objectContaining({ outputValidationStatus: "VALID" }),
      );
    });

    it("reports issue paths relative to the caller's schema", async () => {
      const transport = transportFixture(async () =>
        responseFixture({ kind: "TEXT", text: '{"value":{"label":42}}' }),
      );
      const result = await invokerFixture(
        recorderFixture(),
        transport.transport,
      ).invokeStructured({
        request: { input: "Classify" },
        role: "quick-classifier",
        schema: z.object({ label: z.string() }),
        schemaName: "classification",
      });

      expect(result).toMatchObject({
        issues: [expect.objectContaining({ path: ["label"] })],
      });
    });

    it("rejects an invalid schema name before preparing or recording", async () => {
      const recorder = recorderFixture();
      const transport = transportFixture();
      await expect(
        invokerFixture(recorder, transport.transport).invokeStructured({
          request: { input: "Classify" },
          role: "quick-classifier",
          schema: z.string(),
          schemaName: "not a provider-safe name",
        }),
      ).rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
      expect(transport.prepare).not.toHaveBeenCalled();
      expect(recorder.recordStarted).not.toHaveBeenCalled();
    });

    it.each([
      [{ kind: "REFUSAL", refusal: "I cannot do that" } as const, "REFUSAL"],
      [{ kind: "INCOMPLETE", reason: "MAX_OUTPUT_TOKENS" } as const, "INCOMPLETE"],
      [{ kind: "MISSING" } as const, "OUTPUT_MISSING"],
    ])(
      "reports a %s output state before attempting to parse it",
      async (output, outcome) => {
        const recorder = recorderFixture();
        const transport = transportFixture(async () => responseFixture(output));
        const result = await invokerFixture(
          recorder,
          transport.transport,
        ).invokeStructured({
          request: { input: "Classify" },
          role: "quick-classifier",
          schema: z.object({ label: z.string() }),
          schemaName: "classification",
        });

        expect(result).toMatchObject({ outcome });
        expect(recorder.recordSucceeded.mock.calls[0]?.[0]).not.toHaveProperty(
          "outputValidationStatus",
        );
      },
    );

    it("still records a paid response when reading it throws", async () => {
      const recorder = recorderFixture();
      const transport = transportFixture(async () =>
        responseFixture({ kind: "TEXT", text: '{"value":"classified"}' }),
      );

      await expect(
        invokerFixture(recorder, transport.transport).invokeStructured({
          request: { input: "Classify" },
          role: "quick-classifier",
          schema: z.string().refine(() => {
            throw new Error("refinement blew up");
          }),
          schemaName: "classification",
        }),
      ).rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
      expect(recorder.recordSucceeded).toHaveBeenCalledOnce();
    });

    it("preserves a transport's own preparation error without recording", async () => {
      const recorder = recorderFixture();
      const transport = transportFixture();
      // A code the wrapping path never produces, so identity is not the only
      // thing proving it was passed through unchanged.
      const unsupported = new ModelInvocationError({ code: "INVALID_REQUEST" });
      transport.prepare.mockImplementation(() => {
        throw unsupported;
      });

      await expect(
        invokerFixture(recorder, transport.transport).invokeText({
          request: { input: "Classify" },
          role: "quick-classifier",
        }),
      ).rejects.toBe(unsupported);
      expect(recorder.recordStarted).not.toHaveBeenCalled();
      expect(transport.execute).not.toHaveBeenCalled();
    });

    it("classifies an unclassified preparation failure as configuration", async () => {
      const recorder = recorderFixture();
      const transport = transportFixture();
      transport.prepare.mockImplementation(() => {
        throw new Error("schema conversion blew up");
      });

      await expect(
        invokerFixture(recorder, transport.transport).invokeText({
          request: { input: "Classify" },
          role: "quick-classifier",
        }),
      ).rejects.toMatchObject({ code: "INVALID_CONFIGURATION", retryable: false });
      expect(recorder.recordStarted).not.toHaveBeenCalled();
    });

    it("supports asynchronous Zod refinements without leaking Zod async errors", async () => {
      const transport = transportFixture(async () =>
        responseFixture({ kind: "TEXT", text: '{"value":"invalid"}' }),
      );
      const result = await invokerFixture(
        recorderFixture(),
        transport.transport,
      ).invokeStructured({
        request: { input: "Classify" },
        role: "quick-classifier",
        schema: z.string().refine(async (value) => value === "valid"),
        schemaName: "classification",
      });

      expect(result).toEqual(
        expect.objectContaining({
          issues: expect.any(Array),
          outcome: "STRUCTURED_OUTPUT_FAILURE",
          reason: "SCHEMA_MISMATCH",
        }),
      );
    });
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
        transports: {
          primary: transportFixture(async () => response).transport,
        },
      });

      await expect(
        invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
      ).resolves.toBe(response);
      expect(recorderErrors).toEqual([[recorderError, "succeeded"]]);
    });

    it("preserves a typed provider error when recordFailed throws", async () => {
      const providerError = new ModelInvocationError({
        code: "PROVIDER_UNAVAILABLE",
      });
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
          primary: transportFixture(async () => {
            throw providerError;
          }).transport,
        },
      });

      await expect(
        invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
      ).rejects.toBe(providerError);
      expect(recorderErrors).toEqual([[recorderError, "failed"]]);
    });

    it("sanitises the default recorder-error report", async () => {
      const recorder = recorderFixture();
      recorder.recordSucceeded.mockImplementation(() => {
        throw Object.assign(new Error("SECRET_RECORDER_PAYLOAD"), {
          code: "P2002",
          name: "DatabaseError",
          status: 409,
        });
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await invokerFixture(recorder).invoke({
        request: { input: "Classify" },
        role: "quick-classifier",
      });

      const reported = consoleError.mock.calls[0]?.[0] as Error;
      expect(reported.message).toContain("DatabaseError");
      expect(reported.message).toContain("status 409");
      expect(reported.message).toContain("code P2002");
      expect(reported.message).not.toContain("SECRET_RECORDER_PAYLOAD");
      expect(reported.cause).toBeUndefined();
    });

    it("fails closed with a typed error when recordStarted throws", async () => {
      const recorderError = new Error("Recorder unavailable");
      const recorder = recorderFixture();
      recorder.recordStarted.mockImplementation(() => {
        throw recorderError;
      });
      const transport = transportFixture();

      await expect(
        invokerFixture(recorder, transport.transport).invoke({
          request: { input: "Classify" },
          role: "quick-classifier",
        }),
      ).rejects.toMatchObject({
        cause: recorderError,
        code: "RECORDING_UNAVAILABLE",
        retryable: true,
      });
      expect(transport.execute).not.toHaveBeenCalled();
    });
  });

  describe("cancellation", () => {
    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
      "rejects invalid per-call timeout %s before recording",
      async (timeoutMs) => {
        const recorder = recorderFixture();
        const transport = transportFixture();
        const invocation = invokerFixture(recorder, transport.transport).invoke({
          request: { input: "Classify" },
          role: "quick-classifier",
          timeoutMs,
        });

        await expect(invocation).rejects.toMatchObject({
          code: "INVALID_CONFIGURATION",
        });
        expect(recorder.recordStarted).not.toHaveBeenCalled();
        expect(transport.prepare).not.toHaveBeenCalled();
      },
    );

    it("rejects an invalid default timeout when the invoker is created", () => {
      expect(() =>
        createModelInvoker({
          defaultTimeoutMs: 0,
          roleBindings,
          recorder: recorderFixture(),
          transports: { primary: transportFixture().transport },
        }),
      ).toThrow(expect.objectContaining({ code: "INVALID_CONFIGURATION" }));
    });

    it("starts the timeout after recordStarted", async () => {
      let abortedOnArrival: boolean | undefined;
      const recorder = recorderFixture();
      recorder.recordStarted.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 30)),
      );
      const transport = transportFixture(async (options) => {
        abortedOnArrival = options.signal.aborted;
        return responseFixture();
      });
      const invoker = createModelInvoker({
        defaultTimeoutMs: 20,
        roleBindings,
        recorder,
        transports: { primary: transport.transport },
      });

      await invoker.invoke({
        request: { input: "Classify" },
        role: "quick-classifier",
      });

      expect(abortedOnArrival).toBe(false);
      expect(DEFAULT_TIMEOUT_MS).toBe(60_000);
    });

    it.each([
      ["an already-cancelled caller", undefined, "ABORTED"],
      ["an already-elapsed caller timeout", 0, "TIMED_OUT"],
    ] as const)(
      "rejects %s without recording an invocation",
      async (_label, timeout, code) => {
        const recorder = recorderFixture();
        const transport = transportFixture();
        const signal =
          timeout === undefined ? AbortSignal.abort() : AbortSignal.timeout(timeout);
        await new Promise((resolve) => setTimeout(resolve, 1));

        await expect(
          invokerFixture(recorder, transport.transport).invoke({
            request: { input: "Classify" },
            role: "quick-classifier",
            signal,
          }),
        ).rejects.toMatchObject({ code });
        expect(recorder.recordStarted).not.toHaveBeenCalled();
        expect(transport.prepare).not.toHaveBeenCalled();
      },
    );

    it("maps caller cancellation to ABORTED", async () => {
      const controller = new AbortController();
      const transport = transportFixture(async () => {
        controller.abort();
        throw new Error("SDK abort detail");
      });

      await expect(
        invokerFixture(recorderFixture(), transport.transport).invoke({
          request: { input: "Classify" },
          role: "quick-classifier",
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ code: "ABORTED", retryable: false });
    });

    it("maps invocation timeout to TIMED_OUT", async () => {
      const transport = transportFixture(async (options) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(options.signal.aborted).toBe(true);
        throw new Error("SDK abort detail");
      });
      const invoker = createModelInvoker({
        defaultTimeoutMs: 1,
        roleBindings,
        recorder: recorderFixture(),
        transports: { primary: transport.transport },
      });

      await expect(
        invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
      ).rejects.toMatchObject({ code: "TIMED_OUT", retryable: true });
    });
  });
});
