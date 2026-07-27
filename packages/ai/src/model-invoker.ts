import { randomUUID } from "node:crypto";

import { raLogger } from "@oaknational/resource-adapter-logger";

import type {
  InvocationRecorder,
  ModelInvocationStarted,
} from "./invocation-recorder.js";
import { providerForModel } from "./model-catalogue.js";
import type { ModelRole, ModelRoutes, ModelTransportId } from "./model-routes.js";
import type {
  ModelTransport,
  ModelTransportOptions,
  ResolvedModelInvocation,
} from "./model-transport.js";
import type { ModelInvocationRequest, ModelInvocationResponse } from "./protocol.js";

/** The lifecycle event a recorder was writing when it failed. */
export type RecordingStage = "failed" | "started" | "succeeded";

export type RecorderErrorHandler = (error: unknown, stage: RecordingStage) => void;

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

export type ModelInvoker<TRoutes extends ModelRoutes> = Readonly<{
  invoke(
    params: InvokeModelParams<ModelRole<TRoutes>>,
  ): Promise<ModelInvocationResponse>;
}>;

export type ModelInvokerConfig<TRoutes extends ModelRoutes> = Readonly<{
  /**
   * Applied to every invocation that does not pass its own `timeoutMs`.
   * Defaults to {@link DEFAULT_TIMEOUT_MS}.
   */
  defaultTimeoutMs?: number;
  models: TRoutes;
  /**
   * Called when `recordSucceeded` or `recordFailed` throws. Defaults to
   * reporting sanitised metadata through the shared logger. Custom handlers
   * receive the raw recorder error and are responsible for redacting it.
   *
   * Recorder and handler failures never propagate to the invocation caller.
   */
  onRecorderError?: RecorderErrorHandler;
  recorder: InvocationRecorder;
  transports: Readonly<Record<ModelTransportId<TRoutes>, ModelTransport>>;
}>;

function reportRecorderError(error: unknown, stage: RecordingStage): void {
  // Deliberately do not attach the raw error as a cause: recorder failures can
  // contain prompts, model output, or persistence payloads.
  const rejectionKind = error instanceof Error ? "an Error" : "a non-Error value";
  raLogger("ai").error(
    new Error(
      `Model invocation recorder failed with ${rejectionKind} while recording "${stage}".`,
    ),
    { report: true },
  );
}

export const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

function validateTimeoutMs(timeoutMs: number, field: string): number {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(
      `${field} must be an integer between 1 and ${MAX_TIMEOUT_MS}.`,
    );
  }

  return timeoutMs;
}

function resolveSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

export function createModelInvoker<const TRoutes extends ModelRoutes>(
  config: ModelInvokerConfig<TRoutes>,
): ModelInvoker<TRoutes> {
  const onRecorderError = config.onRecorderError ?? reportRecorderError;
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
      try {
        onRecorderError(error, stage);
      } catch {
        // Keep a broken custom handler observable without allowing it to mask a
        // paid-for response or the original provider error.
        try {
          raLogger("ai").error(
            new Error(
              `Model invocation recorder error handler failed while reporting "${stage}".`,
            ),
            { report: true },
          );
        } catch {
          // Last resort: error reporting must never change invocation semantics.
        }
      }
    }
  }

  return {
    async invoke(params) {
      const route = config.models[params.role];
      if (!route) {
        throw new Error(`Unknown model role: ${params.role}`);
      }

      const transport = config.transports[route.transport as ModelTransportId<TRoutes>];
      if (!transport) {
        throw new Error(`Unknown model transport: ${route.transport}`);
      }

      const resolvedInvocation: ResolvedModelInvocation = {
        ...(params.correlationKey === undefined
          ? {}
          : { correlationKey: params.correlationKey }),
        invocationId: randomUUID(),
        model: route.model,
        provider: providerForModel(route.model),
        request: params.request,
        role: params.role,
        transport: route.transport,
      };
      const started: ModelInvocationStarted = {
        ...resolvedInvocation,
        startedAt: new Date(),
      };

      const timeoutMs =
        params.timeoutMs === undefined
          ? defaultTimeoutMs
          : validateTimeoutMs(params.timeoutMs, "timeoutMs");
      const options: ModelTransportOptions = {
        signal: resolveSignal(params.signal, timeoutMs),
      };

      // Deliberately fail closed: a model is never invoked without an audit
      // record, so a recorder outage prevents the call.
      await config.recorder.recordStarted(started);

      let response: ModelInvocationResponse;
      try {
        response = await transport.invoke(resolvedInvocation, options);
      } catch (error) {
        const completedAt = new Date();
        await recordOutcome("failed", () =>
          config.recorder.recordFailed({
            ...started,
            completedAt,
            durationMs: completedAt.getTime() - started.startedAt.getTime(),
            error,
          }),
        );
        throw error;
      }

      const completedAt = new Date();
      await recordOutcome("succeeded", () =>
        config.recorder.recordSucceeded({
          ...started,
          completedAt,
          durationMs: completedAt.getTime() - started.startedAt.getTime(),
          response,
        }),
      );

      return response;
    },
  };
}
