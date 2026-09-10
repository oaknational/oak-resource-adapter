import {
  probeDatabase,
  type DatabaseProbeFailure,
} from "@oaknational/resource-adapter-db";

import {
  ModelConfigurationError,
  modelConfigurationErrors,
  resolveModelTransport,
} from "../ai/model-configuration";

/** Public responses must use fixed messages, never upstream errors or env values. */
const readinessMessages = {
  ...modelConfigurationErrors,
  OPENAI_TRANSPORT_CONFIGURED: "OpenAI transport configured.",
  DETERMINISTIC_TRANSPORT_CONFIGURED: "Deterministic transport configured.",
  DATABASE_CONNECTED: "Database connected.",
  DATABASE_NOT_CONFIGURED: "The database connection is not configured.",
  DATABASE_CERTIFICATE_REJECTED: "The database's certificate was not trusted.",
  DATABASE_REFUSED_CONNECTION: "The database refused the connection.",
  DATABASE_UNAVAILABLE: "The database could not be reached.",
} as const;

type ReadinessCode = keyof typeof readinessMessages;

/**
 * These failures need operator intervention rather than a deployment retry.
 * Keep failure codes in sync with scripts/check-deployment-readiness.mjs so
 * its log allowlist recognises them.
 */
const terminalCodes: ReadonlySet<string> = new Set([
  ...Object.keys(modelConfigurationErrors),
  "DATABASE_NOT_CONFIGURED",
  "DATABASE_CERTIFICATE_REJECTED",
  "DATABASE_REFUSED_CONNECTION",
]);

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

const databaseCodes: Record<DatabaseProbeFailure, ReadinessCode> = {
  "certificate-rejected": "DATABASE_CERTIFICATE_REJECTED",
  "not-configured": "DATABASE_NOT_CONFIGURED",
  refused: "DATABASE_REFUSED_CONNECTION",
  unavailable: "DATABASE_UNAVAILABLE",
};

async function database(): Promise<CheckOutcome> {
  const label = "Database";
  const failure = await probeDatabase();

  return failure
    ? { label, status: "not-ready", code: databaseCodes[failure] }
    : { label, status: "ready", code: "DATABASE_CONNECTED" };
}

function describeCheck({ label, status, code }: CheckOutcome): ReadinessCheck {
  return {
    label,
    status,
    message: readinessMessages[code],
    ...(status === "not-ready" ? { code, retryable: !terminalCodes.has(code) } : {}),
  };
}

export async function checkReadiness() {
  const checks = {
    database: describeCheck(await database()),
    modelConfiguration: describeCheck(modelConfiguration()),
  };
  const status = Object.values(checks).every((check) => check.status === "ready")
    ? "ready"
    : "not-ready";
  return { status, checks } as const;
}
