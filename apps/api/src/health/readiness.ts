import {
  probeDatabase,
  type DatabaseProbeFailure,
} from "@oaknational/resource-adapter-db";
import {
  probeArtifactStorage,
  type StorageProbeFailure,
} from "@oaknational/resource-adapter-storage";

import {
  ModelConfigurationError,
  modelConfigurationErrors,
  resolveModelTransport,
} from "../ai/model-configuration";
import { isDeployment } from "../environment";

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
  ARTIFACT_STORAGE_CONFIGURED: "Artifact storage configured.",
  ARTIFACT_STORAGE_NOT_REQUIRED: "Artifact storage is not required off a deployment.",
  ARTIFACT_STORAGE_NOT_CONFIGURED: "The artifact storage bucket is not configured.",
  ARTIFACT_STORAGE_IDENTITY_INCOMPLETE: "The artifact storage identity is incomplete.",
  ARTIFACT_STORAGE_IDENTITY_NOT_FEDERATED:
    "The artifact storage identity is not federated.",
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
  "ARTIFACT_STORAGE_NOT_CONFIGURED",
  "ARTIFACT_STORAGE_IDENTITY_INCOMPLETE",
  "ARTIFACT_STORAGE_IDENTITY_NOT_FEDERATED",
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

const storageCodes: Record<StorageProbeFailure, ReadinessCode> = {
  "bucket-not-configured": "ARTIFACT_STORAGE_NOT_CONFIGURED",
  "identity-incomplete": "ARTIFACT_STORAGE_IDENTITY_INCOMPLETE",
  "identity-not-federated": "ARTIFACT_STORAGE_IDENTITY_NOT_FEDERATED",
};

/**
 * Only a deployment is held to this. Elsewhere the bucket is reached with a
 * developer's own credentials, or not at all, so an unset one is not a fault.
 */
function artifactStorage(): CheckOutcome {
  const label = "Artifact storage";

  if (!isDeployment()) {
    return { label, status: "ready", code: "ARTIFACT_STORAGE_NOT_REQUIRED" };
  }

  const failure = probeArtifactStorage({ requireFederatedIdentity: true });

  return failure
    ? { label, status: "not-ready", code: storageCodes[failure] }
    : { label, status: "ready", code: "ARTIFACT_STORAGE_CONFIGURED" };
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
    artifactStorage: describeCheck(artifactStorage()),
    database: describeCheck(await database()),
    modelConfiguration: describeCheck(modelConfiguration()),
  };
  const status = Object.values(checks).every((check) => check.status === "ready")
    ? "ready"
    : "not-ready";
  return { status, checks } as const;
}
