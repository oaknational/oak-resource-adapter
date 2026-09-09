import {
  ModelConfigurationError,
  modelConfigurationErrors,
  resolveModelTransport,
} from "../ai/model-configuration";

/**
 * The readiness response is public and unauthenticated, and every message it
 * serves comes from here. A check reports a code and no text of its own, so an
 * environment value or an upstream error has no route into what is served.
 */
const readinessMessages = {
  ...modelConfigurationErrors,
  OPENAI_TRANSPORT_CONFIGURED: "OpenAI transport configured.",
  DETERMINISTIC_TRANSPORT_CONFIGURED: "Deterministic transport configured.",
} as const;

type ReadinessCode = keyof typeof readinessMessages;

/**
 * Configuration is read from the environment on each request, so a probe that
 * retries one of these codes is waiting for something only a redeploy changes.
 * A check whose readiness can arrive on its own must not be listed here.
 *
 * A new check or code also belongs in `reportableFailures` in
 * scripts/check-deployment-readiness.mjs, or deployment logs will not name it.
 */
const terminalCodes: ReadonlySet<string> = new Set(
  Object.keys(modelConfigurationErrors),
);

type CheckOutcome = Readonly<{
  label: string;
  status: "ready" | "not-ready";
  code: ReadinessCode;
}>;

export type ReadinessCheck = Readonly<{
  label: string;
  status: "ready" | "not-ready";
  message: string;
  code?: ReadinessCode;
  retryable?: boolean;
}>;

function modelConfiguration(): CheckOutcome {
  const label = "Model configuration";
  try {
    return {
      label,
      status: "ready",
      code:
        resolveModelTransport() === "openai"
          ? "OPENAI_TRANSPORT_CONFIGURED"
          : "DETERMINISTIC_TRANSPORT_CONFIGURED",
    };
  } catch (error) {
    if (!(error instanceof ModelConfigurationError)) {
      throw error;
    }
    return { label, status: "not-ready", code: error.configurationCode };
  }
}

function describeCheck({ label, status, code }: CheckOutcome): ReadinessCheck {
  return {
    label,
    status,
    message: readinessMessages[code],
    ...(status === "not-ready" ? { code, retryable: !terminalCodes.has(code) } : {}),
  };
}

export function checkReadiness() {
  const checks = { modelConfiguration: describeCheck(modelConfiguration()) };
  const status = Object.values(checks).every((check) => check.status === "ready")
    ? "ready"
    : "not-ready";
  return { status, checks } as const;
}
