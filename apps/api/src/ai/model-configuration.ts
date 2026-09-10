import { ModelInvocationError } from "@oaknational/resource-adapter-ai";

import { isProductionDeployment } from "../environment";

export const modelConfigurationErrors = {
  MISSING_OPENAI_API_KEY: "OPENAI_API_KEY is not configured.",
  UNKNOWN_MODEL_TRANSPORT: "MODEL_TRANSPORT must be openai or deterministic.",
  DETERMINISTIC_TRANSPORT_FORBIDDEN:
    "Deterministic model transport is not allowed in production.",
} as const;

export type ModelConfigurationCode = keyof typeof modelConfigurationErrors;

export class ModelConfigurationError extends ModelInvocationError {
  readonly configurationCode: ModelConfigurationCode;

  constructor(code: ModelConfigurationCode) {
    super({ code: "INVALID_CONFIGURATION", message: modelConfigurationErrors[code] });
    this.configurationCode = code;
  }
}

export function resolveModelTransport(): "openai" | "deterministic" {
  const transport = process.env.MODEL_TRANSPORT ?? "openai";
  if (transport === "deterministic") {
    if (isProductionDeployment()) {
      throw new ModelConfigurationError("DETERMINISTIC_TRANSPORT_FORBIDDEN");
    }
    return transport;
  }
  if (transport !== "openai") {
    throw new ModelConfigurationError("UNKNOWN_MODEL_TRANSPORT");
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new ModelConfigurationError("MISSING_OPENAI_API_KEY");
  }
  return transport;
}
