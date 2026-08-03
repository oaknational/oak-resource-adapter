import { randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  InvocationRecorder,
  ModelInvocationStarted,
} from "./invocation-recorder.js";
import {
  ModelInvocationError,
  isModelInvocationError,
  normaliseModelInvocationError,
} from "./model-invocation-error.js";
import {
  outputFailure,
  type ModelInvocationMeta,
  type ModelOutputRequirement,
  type OutputValidationStatus,
  type StructuredModelOutcome,
  type StructuredModelOutputResult,
  type TextModelOutcome,
  type TextModelOutputResult,
} from "./model-output.js";
import {
  DEFAULT_TIMEOUT_MS,
  resolveSignal,
  validateTimeoutMs,
} from "./invocation-timeout.js";
import { providerForModel } from "./model-catalogue.js";
import type { ModelTransport, ModelTransportOptions } from "./model-transport.js";
import type {
  ModelInvocationRequest,
  ModelInvocationResponse,
  ModelResponseRecord,
} from "./protocol.js";
import {
  createRecorderErrorReporter,
  type RecorderErrorHandler,
  type RecordingStage,
} from "./recorder-error-reporting.js";
import type {
  ModelTransportInvocation,
  ResolvedModelInvocation,
} from "./resolved-invocation.js";
import type { ModelRole, ModelTransportId, RoleBindings } from "./role-bindings.js";

export type InvokeModelParams<TRole extends string> = Readonly<{
  /** Correlation metadata only; grants no idempotency. */
  correlationKey?: string;
  promptTemplateId?: string;
  request: ModelInvocationRequest;
  role: TRole;
  signal?: AbortSignal;
  timeoutMs?: number;
}>;

type OutputManagedText = Omit<NonNullable<ModelInvocationRequest["text"]>, "format"> &
  Readonly<{ format?: never }>;

/** The convenience methods own `text.format`; callers own other text options. */
export type OutputManagedModelInvocationRequest = Omit<ModelInvocationRequest, "text"> &
  Readonly<{ text?: OutputManagedText }>;

export type InvokeTextModelParams<TRole extends string> = Omit<
  InvokeModelParams<TRole>,
  "request"
> &
  Readonly<{ request: OutputManagedModelInvocationRequest }>;

export type InvokeStructuredModelParams<
  TRole extends string,
  TSchema extends z.ZodType,
> = InvokeTextModelParams<TRole> &
  Readonly<{
    schemaName: string;
    schema: TSchema;
  }>;

export type ModelInvoker<TBindings extends RoleBindings> = Readonly<{
  invoke(
    params: InvokeModelParams<ModelRole<TBindings>>,
  ): Promise<ModelInvocationResponse>;
  invokeText(
    params: InvokeTextModelParams<ModelRole<TBindings>>,
  ): Promise<TextModelOutputResult>;
  invokeStructured<TSchema extends z.ZodType>(
    params: InvokeStructuredModelParams<ModelRole<TBindings>, TSchema>,
  ): Promise<StructuredModelOutputResult<z.output<TSchema>>>;
}>;

export type ModelInvokerConfig<TBindings extends RoleBindings> = Readonly<{
  defaultTimeoutMs?: number;
  roleBindings: TBindings;
  /**
   * Receives raw recorder errors; custom handlers must redact them. Recorder
   * and handler failures never propagate to the invocation caller.
   */
  onRecorderError?: RecorderErrorHandler;
  recorder: InvocationRecorder;
  transports: Readonly<Record<ModelTransportId<TBindings>, ModelTransport>>;
}>;

type OutputInterpretation<TOutcome> = Readonly<{
  outcome: TOutcome;
  outputValidationStatus?: OutputValidationStatus;
}>;

type InterpretOutput<TOutcome> = (
  response: ModelInvocationResponse,
) => Promise<OutputInterpretation<TOutcome>> | OutputInterpretation<TOutcome>;

type Settled<TValue> =
  Readonly<{ error: unknown; ok: false }> | Readonly<{ ok: true; value: TValue }>;

/**
 * Runs interpretation without letting a throw skip the success recording: the
 * response has already been paid for by the time it is read.
 */
async function settled<TValue>(
  run: () => Promise<TValue> | TValue,
): Promise<Settled<TValue>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { error, ok: false };
  }
}

function completionFields(started: ModelInvocationStarted) {
  const completedAt = new Date();
  return {
    completedAt,
    durationMs: completedAt.getTime() - started.startedAt.getTime(),
  };
}

function invalidConfiguration(cause: unknown): ModelInvocationError {
  return new ModelInvocationError({ cause, code: "INVALID_CONFIGURATION" });
}

function validatedTimeout(timeoutMs: number, field: string): number {
  try {
    return validateTimeoutMs(timeoutMs, field);
  } catch (error) {
    throw invalidConfiguration(error);
  }
}

/** Keeps reported issue paths relative to the caller's schema, not our envelope. */
async function interpretStructuredOutput<TSchema extends z.ZodType>(
  schema: TSchema,
  response: ModelInvocationResponse,
): Promise<OutputInterpretation<StructuredModelOutcome<z.output<TSchema>>>> {
  if (response.output.kind !== "TEXT") {
    return { outcome: outputFailure(response.output) };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(response.output.text);
  } catch {
    return {
      outcome: { outcome: "STRUCTURED_OUTPUT_FAILURE", reason: "INVALID_JSON" },
      outputValidationStatus: "INVALID_JSON",
    };
  }

  const envelope = z.object({ value: z.unknown() }).strict().safeParse(parsedJson);
  const parsed = envelope.success
    ? await schema.safeParseAsync(envelope.data.value)
    : envelope;
  if (!parsed.success) {
    return {
      outcome: {
        issues: parsed.error.issues,
        outcome: "STRUCTURED_OUTPUT_FAILURE",
        reason: "SCHEMA_MISMATCH",
      },
      outputValidationStatus: "SCHEMA_MISMATCH",
    };
  }

  return {
    outcome: { outcome: "SUCCESS", output: parsed.data },
    outputValidationStatus: "VALID",
  };
}

const STRUCTURED_OUTPUT_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export function createModelInvoker<const TBindings extends RoleBindings>(
  config: ModelInvokerConfig<TBindings>,
): ModelInvoker<TBindings> {
  const reportRecorderFailure = createRecorderErrorReporter(config.onRecorderError);
  const defaultTimeoutMs = validatedTimeout(
    config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    "defaultTimeoutMs",
  );

  async function recordOutcome(
    stage: RecordingStage,
    write: () => Promise<void> | void,
  ): Promise<void> {
    try {
      await write();
    } catch (error) {
      await reportRecorderFailure(error, stage);
    }
  }

  async function failInvocation(
    started: ModelInvocationStarted,
    error: ModelInvocationError,
    response?: ModelResponseRecord,
  ): Promise<never> {
    await recordOutcome("failed", () =>
      config.recorder.recordFailed({
        ...started,
        ...completionFields(started),
        error,
        ...(response === undefined ? {} : { response }),
      }),
    );

    throw error;
  }

  async function invokeWithOutput<TOutcome>(
    params: InvokeModelParams<ModelRole<TBindings>>,
    output: ModelOutputRequirement,
    interpret: InterpretOutput<TOutcome>,
  ): Promise<Readonly<{ meta: ModelInvocationMeta; outcome: TOutcome }>> {
    const binding = config.roleBindings[params.role];
    if (!binding) {
      throw invalidConfiguration(new Error(`Unknown model role: ${params.role}`));
    }

    const transport =
      config.transports[binding.transport as ModelTransportId<TBindings>];
    if (!transport) {
      throw invalidConfiguration(
        new Error(`Unknown model transport: ${binding.transport}`),
      );
    }

    const timeoutMs =
      params.timeoutMs === undefined
        ? defaultTimeoutMs
        : validatedTimeout(params.timeoutMs, "timeoutMs");

    if (params.signal?.aborted) {
      throw normaliseModelInvocationError(params.signal.reason, params.signal);
    }

    const invocationId = randomUUID();
    const logicalInvocation: ModelTransportInvocation = {
      ...(params.correlationKey === undefined
        ? {}
        : { correlationKey: params.correlationKey }),
      invocationId,
      model: binding.model,
      ...(params.promptTemplateId === undefined
        ? {}
        : { promptTemplateId: params.promptTemplateId }),
      provider: providerForModel(binding.model),
      request: params.request,
      role: params.role,
      transport: binding.transport,
    };

    let prepared;
    try {
      prepared = transport.prepare(logicalInvocation, output);
    } catch (error) {
      throw isModelInvocationError(error) ? error : invalidConfiguration(error);
    }

    const resolvedInvocation: ResolvedModelInvocation = {
      ...logicalInvocation,
      request: prepared.request,
    };
    const started: ModelInvocationStarted = {
      ...resolvedInvocation,
      startedAt: new Date(),
    };

    // Deliberately fail closed: a model is never invoked without an audit
    // record, so a recorder outage prevents the call.
    try {
      await config.recorder.recordStarted(started);
    } catch (error) {
      throw new ModelInvocationError({
        cause: error,
        code: "RECORDING_UNAVAILABLE",
      });
    }

    // Started only now: the timeout budgets the provider call, so a slow
    // recorder must not consume it.
    const options: ModelTransportOptions = {
      signal: resolveSignal(params.signal, timeoutMs),
    };

    let execution;
    try {
      execution = await prepared.execute(options);
    } catch (error) {
      return failInvocation(
        started,
        normaliseModelInvocationError(error, options.signal),
      );
    }

    if (execution.kind === "FAILURE") {
      return failInvocation(started, execution.error, execution.response);
    }

    const response: ModelInvocationResponse = execution.response;
    const completion = completionFields(started);
    const interpretation = await settled(() => interpret(response));

    await recordOutcome("succeeded", () =>
      config.recorder.recordSucceeded({
        ...started,
        ...completion,
        ...(interpretation.ok &&
        interpretation.value.outputValidationStatus !== undefined
          ? {
              outputValidationStatus: interpretation.value.outputValidationStatus,
            }
          : {}),
        response,
      }),
    );

    // A throwing schema is our bug, but the paid response was still recorded.
    if (!interpretation.ok) {
      throw isModelInvocationError(interpretation.error)
        ? interpretation.error
        : invalidConfiguration(interpretation.error);
    }

    return {
      meta: {
        invocationId,
        ...(response.providerResponseId === undefined
          ? {}
          : { providerResponseId: response.providerResponseId }),
        ...(response.usage === undefined ? {} : { usage: response.usage }),
      },
      outcome: interpretation.value.outcome,
    };
  }

  return {
    async invoke(params) {
      const { outcome } = await invokeWithOutput(
        params,
        { kind: "PROVIDER_DEFAULT" },
        (response) => ({ outcome: response }),
      );
      return outcome;
    },

    async invokeStructured(params) {
      if (!STRUCTURED_OUTPUT_NAME.test(params.schemaName)) {
        throw invalidConfiguration(
          new Error(
            "schemaName must be 1–64 letters, numbers, underscores, or hyphens.",
          ),
        );
      }

      // Wrapped so any schema, including a primitive or a union, reaches the
      // provider as the object root that structured output modes require.
      const { meta, outcome } = await invokeWithOutput(
        params,
        {
          kind: "STRUCTURED",
          name: params.schemaName,
          schema: z.object({ value: params.schema }),
        },
        (response) => interpretStructuredOutput(params.schema, response),
      );
      return { ...outcome, meta };
    },

    async invokeText(params) {
      const { meta, outcome } = await invokeWithOutput<TextModelOutcome>(
        params,
        { kind: "TEXT" },
        (response) => ({
          outcome:
            response.output.kind === "TEXT"
              ? { outcome: "SUCCESS", output: response.output.text }
              : outputFailure(response.output),
        }),
      );
      return { ...outcome, meta };
    },
  };
}
