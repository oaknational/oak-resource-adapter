import {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  type default as OpenAI,
} from "openai";
import type { Response } from "openai/resources/responses/responses";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ModelOutputRequirement, ModelTransportInvocation } from "./index.js";
import { createOpenAIResponsesTransport } from "./index.js";

const invocation: ModelTransportInvocation = {
  invocationId: "invocation-1",
  model: "gpt-5.6-luna",
  provider: "openai",
  request: { input: "Classify this", text: { verbosity: "low" } },
  role: "quick-classifier",
  transport: "openai",
};

function responseFixture(overrides: Partial<Response> = {}): Response {
  return {
    created_at: 1,
    error: null,
    id: "response-1",
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: "gpt-5.6-luna",
    object: "response",
    output: [
      {
        content: [{ annotations: [], text: "classified", type: "output_text" }],
        id: "message-1",
        role: "assistant",
        status: "completed",
        type: "message",
      },
    ],
    output_text: "classified",
    parallel_tool_calls: true,
    status: "completed",
    temperature: null,
    text: { format: { type: "text" } },
    tool_choice: "auto",
    tools: [],
    top_p: null,
    truncation: "disabled",
    usage: {
      input_tokens: 12,
      input_tokens_details: { cache_write_tokens: 0, cached_tokens: 0 },
      output_tokens: 3,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 15,
    },
    ...overrides,
  } as Response;
}

function transportFixture(response: Response = responseFixture()) {
  const create = vi.fn<(body: unknown) => Promise<Response>>(async () => response);
  const client = {
    responses: { create },
  } as unknown as Pick<OpenAI, "responses">;
  return { create, transport: createOpenAIResponsesTransport({ client }) };
}

async function executeOutput(output: ModelOutputRequirement, response: Response) {
  const { transport } = transportFixture(response);
  const result = await transport
    .prepare(invocation, output)
    .execute({ signal: new AbortController().signal });
  if (result.kind === "FAILURE") {
    throw result.error;
  }
  return result.response;
}

describe("createOpenAIResponsesTransport", () => {
  it("prepares and exposes the exact text request before execution", async () => {
    const { create, transport } = transportFixture();
    const prepared = transport.prepare(invocation, { kind: "TEXT" });

    expect(create).not.toHaveBeenCalled();
    expect(prepared.request).toEqual({
      input: "Classify this",
      model: "gpt-5.6-luna",
      store: false,
      stream: false,
      text: { format: { type: "text" }, verbosity: "low" },
    });

    const controller = new AbortController();
    await expect(
      prepared.execute({ signal: controller.signal }),
    ).resolves.toMatchObject({ kind: "SUCCESS" });
    expect(create).toHaveBeenCalledWith(prepared.request, {
      signal: controller.signal,
    });
  });

  it("prepares a strict JSON Schema format while preserving text options", () => {
    const { transport } = transportFixture();

    expect(
      transport.prepare(invocation, {
        kind: "STRUCTURED",
        name: "classification",
        schema: z.object({ value: z.string() }),
      }).request,
    ).toEqual({
      input: "Classify this",
      model: "gpt-5.6-luna",
      store: false,
      stream: false,
      text: {
        format: {
          name: "classification",
          schema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            additionalProperties: false,
            properties: { value: { type: "string" } },
            required: ["value"],
            type: "object",
          },
          strict: true,
          type: "json_schema",
        },
        verbosity: "low",
      },
    });
  });

  describe("strict schema representability", () => {
    it.each([
      ["nested objects", z.object({ inner: z.object({ a: z.string() }) })],
      ["nullable fields", z.object({ a: z.string().nullable() })],
      [
        "fields that are both optional and nullable",
        z.object({ a: z.string().nullish() }),
      ],
      [
        "unions",
        z.union([z.object({ k: z.literal("a") }), z.object({ k: z.literal("b") })]),
      ],
      [
        "enums and bounded numbers",
        z.object({ c: z.number().min(0).max(1), t: z.enum(["a", "b"]) }),
      ],
      ["arrays", z.object({ items: z.array(z.string()) })],
      [
        "recursive schemas",
        z.object({
          name: z.string(),
          get children() {
            return z.array(z.string());
          },
        }),
      ],
    ])("accepts %s", (_label, schema) => {
      const { transport } = transportFixture();
      expect(() =>
        transport.prepare(invocation, {
          kind: "STRUCTURED",
          name: "classification",
          schema: z.object({ value: schema }),
        }),
      ).not.toThrow();
    });

    it.each([
      ["optional fields without nullable", z.object({ a: z.string().optional() })],
      ["open records", z.record(z.string(), z.number())],
      ["tuples", z.tuple([z.string(), z.number()])],
      ["transforms", z.string().transform((value) => value.length)],
    ])("rejects %s locally, before any request is sent", (_label, schema) => {
      const { create, transport } = transportFixture();

      expect(() =>
        transport.prepare(invocation, {
          kind: "STRUCTURED",
          name: "classification",
          schema: z.object({ value: schema }),
        }),
      ).toThrow(
        expect.objectContaining({
          code: "INVALID_CONFIGURATION",
          retryable: false,
        }),
      );
      expect(create).not.toHaveBeenCalled();
    });

    it("explains which part of the schema cannot be represented", () => {
      const { transport } = transportFixture();

      expect(() =>
        transport.prepare(invocation, {
          kind: "STRUCTURED",
          name: "classification",
          schema: z.object({ value: z.object({ maybe: z.string().optional() }) }),
        }),
      ).toThrow(/maybe/);
    });
  });

  it("leaves output configuration unchanged for a low-level invocation", () => {
    const { transport } = transportFixture();
    expect(
      transport.prepare(invocation, { kind: "PROVIDER_DEFAULT" }).request,
    ).toMatchObject({ text: { verbosity: "low" } });
  });

  it("opts out of provider-side retention unless the caller asks for it", () => {
    const { transport } = transportFixture();

    expect(
      transport.prepare(
        { ...invocation, request: { input: "Classify this" } },
        {
          kind: "TEXT",
        },
      ).request,
    ).toMatchObject({ store: false });
    expect(
      transport.prepare(
        { ...invocation, request: { input: "Classify this", store: true } },
        { kind: "TEXT" },
      ).request,
    ).toMatchObject({ store: true });
  });

  it("records a serialisable snapshot rather than the object it sends", async () => {
    const { create, transport } = transportFixture();
    const prepared = transport.prepare(invocation, {
      kind: "STRUCTURED",
      name: "classification",
      schema: z.object({ value: z.string() }),
    });

    // Proven serialisable, not asserted to be: the recorded request round-trips,
    // and the SDK helper's non-enumerable parse hooks stay out of it.
    expect(JSON.parse(JSON.stringify(prepared.request))).toEqual(prepared.request);

    await prepared.execute({ signal: new AbortController().signal });
    const sent = create.mock.calls[0]?.[0] as { text: { format: object } };
    expect(sent.text.format).not.toBe(prepared.request.text);
    expect(sent.text.format).toHaveProperty("$parseRaw");
    expect(prepared.request).not.toHaveProperty("text.format.$parseRaw");
  });

  it("normalises text, identity, raw response, and usage", async () => {
    const raw = responseFixture();
    await expect(executeOutput({ kind: "TEXT" }, raw)).resolves.toEqual({
      output: { kind: "TEXT", text: "classified" },
      providerResponseId: "response-1",
      rawResponse: raw,
      usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
    });
  });

  it("prefers an explicit refusal to response output text", async () => {
    const response = responseFixture({
      output: [
        {
          content: [{ refusal: "I cannot classify that", type: "refusal" }],
          id: "message-1",
          role: "assistant",
          status: "completed",
          type: "message",
        },
      ],
      output_text: "",
    });
    await expect(executeOutput({ kind: "TEXT" }, response)).resolves.toMatchObject({
      output: { kind: "REFUSAL", refusal: "I cannot classify that" },
    });
  });

  it.each([
    ["max_output_tokens", "MAX_OUTPUT_TOKENS"],
    ["content_filter", "CONTENT_FILTER"],
    [undefined, "UNKNOWN"],
  ] as const)("normalises incomplete reason %s", async (reason, expected) => {
    const response = responseFixture({
      incomplete_details: reason === undefined ? {} : { reason },
      status: "incomplete",
    });
    await expect(executeOutput({ kind: "TEXT" }, response)).resolves.toMatchObject({
      output: { kind: "INCOMPLETE", reason: expected },
    });
  });

  it("returns a missing output state when no model text part exists", async () => {
    const response = responseFixture({ output: [], output_text: "" });
    await expect(executeOutput({ kind: "TEXT" }, response)).resolves.toMatchObject({
      output: { kind: "MISSING" },
    });
  });

  it("returns failed response bodies with their audit data and typed error", async () => {
    const response = responseFixture({
      error: { code: "invalid_prompt", message: "secret provider detail" },
      status: "failed",
    });
    const { transport } = transportFixture(response);

    await expect(
      transport
        .prepare(invocation, { kind: "TEXT" })
        .execute({ signal: new AbortController().signal }),
    ).resolves.toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "The model provider rejected the invocation request.",
        providerCode: "invalid_prompt",
        retryable: false,
      },
      kind: "FAILURE",
      response: {
        providerResponseId: "response-1",
        rawResponse: response,
        usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
      },
    });
  });

  it("maps SDK failures to the stable provider error contract", async () => {
    const sdkError = Object.assign(new Error("secret provider detail"), {
      status: 503,
    });
    const create = vi.fn(async () => {
      throw sdkError;
    });
    const client = {
      responses: { create },
    } as unknown as Pick<OpenAI, "responses">;
    const transport = createOpenAIResponsesTransport({ client });

    await expect(
      transport
        .prepare(invocation, { kind: "TEXT" })
        .execute({ signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      cause: sdkError,
      code: "PROVIDER_UNAVAILABLE",
      message: "The model provider is temporarily unavailable.",
      retryable: true,
      status: 503,
    });
  });

  it.each([
    // 409 is this API's lock timeout, so it is retryable here in a way a general
    // 409 is not. 408 is transient for any provider and is classified centrally.
    [409, "PROVIDER_UNAVAILABLE"],
    [408, "TIMED_OUT"],
  ] as const)(
    "maps retryable status %s to the %s classification",
    async (status, code) => {
      const sdkError = new APIError(
        status,
        { code: "transient_provider_error", message: "secret provider detail" },
        undefined,
        new Headers(),
      );
      const create = vi.fn(async () => {
        throw sdkError;
      });
      const client = {
        responses: { create },
      } as unknown as Pick<OpenAI, "responses">;

      await expect(
        createOpenAIResponsesTransport({ client })
          .prepare(invocation, { kind: "TEXT" })
          .execute({ signal: new AbortController().signal }),
      ).rejects.toMatchObject({
        cause: sdkError,
        code,
        providerCode: "transient_provider_error",
        retryable: true,
        status,
      });
    },
  );

  it("maps an SDK connection error without an HTTP status", async () => {
    const sdkError = new APIConnectionError({
      message: "secret provider detail",
    });
    const create = vi.fn(async () => {
      throw sdkError;
    });
    const client = {
      responses: { create },
    } as unknown as Pick<OpenAI, "responses">;

    await expect(
      createOpenAIResponsesTransport({ client })
        .prepare(invocation, { kind: "TEXT" })
        .execute({ signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
    });
  });

  it("maps an SDK-owned timeout without an aborted caller signal", async () => {
    const sdkError = new APIConnectionTimeoutError({
      message: "secret provider detail",
    });
    const create = vi.fn(async () => {
      throw sdkError;
    });
    const client = {
      responses: { create },
    } as unknown as Pick<OpenAI, "responses">;

    await expect(
      createOpenAIResponsesTransport({ client })
        .prepare(invocation, { kind: "TEXT" })
        .execute({ signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "TIMED_OUT", retryable: true });
  });
});
