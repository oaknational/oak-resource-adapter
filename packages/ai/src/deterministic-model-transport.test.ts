import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createDeterministicModelTransport } from "./deterministic-model-transport.js";
import type { DeterministicModelResponseResolver } from "./deterministic-model-transport.js";
import { createModelInvoker } from "./model-invoker.js";
import { ModelInvocationError } from "./model-invocation-error.js";
import type { InvocationRecorder } from "./invocation-recorder.js";

const invocation = {
  role: "test",
  request: { input: "Classify this resource" },
} as const;

function setup(resolve: DeterministicModelResponseResolver = () => "worksheet") {
  const recorder = {
    recordStarted: vi.fn<InvocationRecorder["recordStarted"]>(),
    recordSucceeded: vi.fn<InvocationRecorder["recordSucceeded"]>(),
    recordFailed: vi.fn<InvocationRecorder["recordFailed"]>(),
  };
  const transport = createDeterministicModelTransport({ resolve });
  const invoker = createModelInvoker({
    roleBindings: { test: { model: "gpt-5.6-luna", transport: "deterministic" } },
    recorder,
    transports: { deterministic: transport },
  });
  return { invoker, recorder, transport };
}

afterEach(() => vi.restoreAllMocks());

describe("deterministic model transport through the real invoker", () => {
  it("awaits the started record before execution and the success record before returning", async () => {
    const { invoker, recorder, transport } = setup();
    const started = Promise.withResolvers<void>();
    const succeeded = Promise.withResolvers<void>();
    recorder.recordStarted.mockReturnValue(started.promise);
    recorder.recordSucceeded.mockReturnValue(succeeded.promise);
    const prepare = vi.spyOn(transport, "prepare");
    const returned = vi.fn();

    const pending = invoker.invokeText(invocation).then(returned);
    const prepared = prepare.mock.results[0]?.value;
    expect(prepared).toBeDefined();
    const execute = vi.spyOn(prepared!, "execute");
    expect(recorder.recordStarted).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(recorder.recordSucceeded).not.toHaveBeenCalled();

    started.resolve();
    await vi.waitFor(() => expect(recorder.recordSucceeded).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledOnce();
    expect(returned).not.toHaveBeenCalled();
    succeeded.resolve();
    await pending;
    expect(returned).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "SUCCESS" }),
    );
    expect(recorder.recordFailed).not.toHaveBeenCalled();
  });

  it("returns raw and text output without inventing provider IDs or token usage", async () => {
    const resolve = vi.fn<DeterministicModelResponseResolver>(() => "worksheet");
    const { invoker, recorder } = setup(resolve);
    const raw = await invoker.invoke(invocation);
    const text = await invoker.invokeText(invocation);

    expect(raw).toEqual({
      output: { kind: "TEXT", text: "worksheet" },
      rawResponse: { output: { kind: "TEXT", text: "worksheet" } },
    });
    expect(text).toEqual({
      outcome: "SUCCESS",
      output: "worksheet",
      meta: { invocationId: expect.any(String) },
    });
    expect(resolve.mock.calls.map(([, output]) => output)).toEqual([
      { kind: "PROVIDER_DEFAULT" },
      { kind: "TEXT" },
    ]);
    expect(recorder.recordSucceeded).toHaveBeenCalledTimes(2);
  });

  it("snapshots the request and structured envelope before caller-owned values change", async () => {
    const value = { label: "worksheet" };
    const request = { input: "Classify", metadata: { source: "fixture" } };
    const { invoker, recorder } = setup(() => value);
    recorder.recordStarted.mockImplementation(() => {
      request.metadata.source = "changed";
      value.label = "changed";
    });

    const result = await invoker.invokeStructured({
      role: "test",
      request,
      schemaName: "classification",
      schema: z.strictObject({
        label: z.string().transform((label) => label.toUpperCase()),
      }),
    });

    expect(result).toMatchObject({
      outcome: "SUCCESS",
      output: { label: "WORKSHEET" },
    });
    expect(recorder.recordStarted.mock.calls[0]?.[0].request).toEqual({
      model: "gpt-5.6-luna",
      request: { input: "Classify", metadata: { source: "fixture" } },
      output: {
        kind: "STRUCTURED",
        name: "classification",
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            value: {
              type: "object",
              properties: { label: { type: "string" } },
              required: ["label"],
              additionalProperties: false,
            },
          },
          required: ["value"],
        },
      },
    });
    expect(recorder.recordSucceeded.mock.calls[0]?.[0]).toMatchObject({
      outputValidationStatus: "VALID",
      response: {
        output: { kind: "TEXT", text: '{"value":{"label":"worksheet"}}' },
        rawResponse: {
          output: { kind: "TEXT", text: '{"value":{"label":"worksheet"}}' },
        },
      },
    });
  });

  it.each(["{malformed JSON", { label: 42 }])(
    "does not repair an invalid structured fixture: %j",
    async (value) => {
      const { invoker, recorder } = setup(() => value);
      await expect(
        invoker.invokeStructured({
          ...invocation,
          schemaName: "classification",
          schema: z.strictObject({ label: z.string() }),
        }),
      ).resolves.toMatchObject({
        outcome: "STRUCTURED_OUTPUT_FAILURE",
        reason: "SCHEMA_MISMATCH",
        issues: expect.any(Array),
      });
      expect(recorder.recordSucceeded).toHaveBeenCalledWith(
        expect.objectContaining({
          outputValidationStatus: "SCHEMA_MISMATCH",
        }),
      );
      expect(recorder.recordFailed).not.toHaveBeenCalled();
    },
  );

  it("rejects non-string text and raw fixtures before recording", async () => {
    const { invoker, recorder } = setup(() => ({ label: "worksheet" }));
    await expect(invoker.invokeText(invocation)).rejects.toMatchObject({
      code: "INVALID_CONFIGURATION",
    });
    await expect(invoker.invoke(invocation)).rejects.toMatchObject({
      code: "INVALID_CONFIGURATION",
    });
    expect(recorder.recordStarted).not.toHaveBeenCalled();
  });

  it("propagates unknown resolution rather than returning a default success", async () => {
    const error = new ModelInvocationError({
      code: "INVALID_CONFIGURATION",
      message: "Unknown fixture",
    });
    const { invoker, recorder } = setup(() => {
      throw error;
    });
    await expect(invoker.invokeText(invocation)).rejects.toBe(error);
    expect(recorder.recordStarted).not.toHaveBeenCalled();
    expect(recorder.recordSucceeded).not.toHaveBeenCalled();
  });

  it("rejects a pre-aborted call without resolving or recording", async () => {
    const resolve = vi.fn<DeterministicModelResponseResolver>(() => "worksheet");
    const { invoker, recorder } = setup(resolve);
    await expect(
      invoker.invokeText({ ...invocation, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(resolve).not.toHaveBeenCalled();
    expect(recorder.recordStarted).not.toHaveBeenCalled();
  });

  it("records failure if cancellation arrives between preparation and execution", async () => {
    const controller = new AbortController();
    const { invoker, recorder } = setup();
    recorder.recordStarted.mockImplementation(() => controller.abort());
    await expect(
      invoker.invokeText({ ...invocation, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(recorder.recordFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "ABORTED" }) }),
    );
    expect(recorder.recordSucceeded).not.toHaveBeenCalled();
  });

  it("keeps repeated and concurrent responses stable with separate audit identities", async () => {
    const { invoker, recorder } = setup(() => ({ label: "worksheet" }));
    const call = () =>
      invoker.invokeStructured({
        ...invocation,
        schemaName: "classification",
        schema: z.strictObject({ label: z.string() }),
      });
    const first = await call();
    const concurrent = await Promise.all([call(), call(), call()]);
    for (const result of [first, ...concurrent]) {
      expect(result).toMatchObject({
        outcome: "SUCCESS",
        output: { label: "worksheet" },
      });
    }
    const records = recorder.recordSucceeded.mock.calls.map(([record]) => record);
    expect(new Set(records.map(({ invocationId }) => invocationId)).size).toBe(4);
    for (const record of records) {
      expect(record.request).toEqual(records[0]?.request);
      expect(record.response).toEqual(records[0]?.response);
      expect(record.outputValidationStatus).toBe("VALID");
    }
  });
});
