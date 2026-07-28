import { randomUUID } from "node:crypto";

import type {
  InvocationRecorder,
  ModelInvocationStarted,
} from "./invocation-recorder.js";
import {
  DEFAULT_TIMEOUT_MS,
  resolveSignal,
  validateTimeoutMs,
} from "./invocation-timeout.js";
import { providerForModel } from "./model-catalogue.js";
import type { ModelTransport, ModelTransportOptions } from "./model-transport.js";
import type { ModelInvocationRequest, ModelInvocationResponse } from "./protocol.js";
import {
  createRecorderErrorReporter,
  type RecorderErrorHandler,
  type RecordingStage,
} from "./recorder-error-reporting.js";
import type { ResolvedModelInvocation } from "./resolved-invocation.js";
import type { ModelRole, ModelTransportId, RoleBindings } from "./role-bindings.js";

export type InvokeModelParams<TRole extends string> = Readonly<{
  /**
   * Correlation metadata tying this call to the unit of work that caused it,
   * such as a workflow step ID. Grants no idempotency.
   */
  correlationKey?: string;
  request: ModelInvocationRequest;
  role: TRole;
  /** Caller-owned cancellation, composed with the effective timeout. */
  signal?: AbortSignal;
  /** Overrides `defaultTimeoutMs` for this call. */
  timeoutMs?: number;
}>;

export type ModelInvoker<TBindings extends RoleBindings> = Readonly<{
  invoke(
    params: InvokeModelParams<ModelRole<TBindings>>,
  ): Promise<ModelInvocationResponse>;
}>;

export type ModelInvokerConfig<TBindings extends RoleBindings> = Readonly<{
  /**
   * Applied to every invocation that does not pass its own `timeoutMs`.
   * Defaults to {@link DEFAULT_TIMEOUT_MS}.
   */
  defaultTimeoutMs?: number;
  roleBindings: TBindings;
  /**
   * Called when `recordSucceeded` or `recordFailed` throws. Defaults to
   * reporting sanitised metadata through the shared logger. Custom handlers
   * receive the raw recorder error and are responsible for redacting it.
   *
   * Recorder and handler failures never propagate to the invocation caller.
   */
  onRecorderError?: RecorderErrorHandler;
  recorder: InvocationRecorder;
  transports: Readonly<Record<ModelTransportId<TBindings>, ModelTransport>>;
}>;

function completionFields(started: ModelInvocationStarted) {
  const completedAt = new Date();
  return {
    completedAt,
    durationMs: completedAt.getTime() - started.startedAt.getTime(),
  };
}

export function createModelInvoker<const TBindings extends RoleBindings>(
  config: ModelInvokerConfig<TBindings>,
): ModelInvoker<TBindings> {
  const reportRecorderFailure = createRecorderErrorReporter(config.onRecorderError);
  const defaultTimeoutMs = validateTimeoutMs(
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

  return {
    async invoke(params) {
      const binding = config.roleBindings[params.role];
      if (!binding) {
        throw new Error(`Unknown model role: ${params.role}`);
      }

      const transport =
        config.transports[binding.transport as ModelTransportId<TBindings>];
      if (!transport) {
        throw new Error(`Unknown model transport: ${binding.transport}`);
      }

      const resolvedInvocation: ResolvedModelInvocation = {
        ...(params.correlationKey === undefined
          ? {}
          : { correlationKey: params.correlationKey }),
        invocationId: randomUUID(),
        model: binding.model,
        provider: providerForModel(binding.model),
        request: params.request,
        role: params.role,
        transport: binding.transport,
      };
      const started: ModelInvocationStarted = {
        ...resolvedInvocation,
        startedAt: new Date(),
      };

      // Validated before recording so an invalid timeout costs nothing.
      const timeoutMs =
        params.timeoutMs === undefined
          ? defaultTimeoutMs
          : validateTimeoutMs(params.timeoutMs, "timeoutMs");

      // Deliberately fail closed: a model is never invoked without an audit
      // record, so a recorder outage prevents the call.
      await config.recorder.recordStarted(started);

      // Started only now: the timeout budgets the provider call, so a slow
      // recorder must not consume it.
      const options: ModelTransportOptions = {
        signal: resolveSignal(params.signal, timeoutMs),
      };

      let response: ModelInvocationResponse;
      try {
        response = await transport.invoke(resolvedInvocation, options);
      } catch (error) {
        const completion = completionFields(started);
        await recordOutcome("failed", () =>
          config.recorder.recordFailed({ ...started, ...completion, error }),
        );
        throw error;
      }

      const completion = completionFields(started);
      await recordOutcome("succeeded", () =>
        config.recorder.recordSucceeded({ ...started, ...completion, response }),
      );

      return response;
    },
  };
}
