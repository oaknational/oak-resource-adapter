import {
  createModerator,
  MODERATION_ENV_VARS,
  moderationConfigFromEnv,
  type Moderator,
} from "@oaknational/resource-adapter-moderation";

import { isProductionDeployment } from "../environment";
import { deterministicModerator } from "./deterministic-moderator";

export const moderationConfigurationErrors = {
  MISSING_MODERATION_API_URL: `${MODERATION_ENV_VARS.apiUrl} is not configured.`,
  UNKNOWN_MODERATION_TRANSPORT:
    "MODERATION_TRANSPORT must be service or deterministic.",
  DETERMINISTIC_MODERATION_FORBIDDEN:
    "Deterministic moderation is not allowed in production.",
} as const;

export type ModerationConfigurationCode = keyof typeof moderationConfigurationErrors;

// Not a ModelInvocationError: CI fails the browser job when that name reaches its log.
export class ModerationConfigurationError extends Error {
  readonly configurationCode: ModerationConfigurationCode;

  constructor(code: ModerationConfigurationCode) {
    super(moderationConfigurationErrors[code]);
    this.name = "ModerationConfigurationError";
    this.configurationCode = code;
  }
}

export function resolveModerationTransport(): "service" | "deterministic" {
  const transport = process.env.MODERATION_TRANSPORT ?? "service";
  if (transport === "deterministic") {
    if (isProductionDeployment()) {
      throw new ModerationConfigurationError("DETERMINISTIC_MODERATION_FORBIDDEN");
    }
    return transport;
  }
  if (transport !== "service") {
    throw new ModerationConfigurationError("UNKNOWN_MODERATION_TRANSPORT");
  }
  if (!process.env[MODERATION_ENV_VARS.apiUrl]?.trim()) {
    throw new ModerationConfigurationError("MISSING_MODERATION_API_URL");
  }
  return transport;
}

export function createApplicationModerator(): Moderator {
  return resolveModerationTransport() === "deterministic"
    ? deterministicModerator
    : createModerator(moderationConfigFromEnv(process.env));
}
