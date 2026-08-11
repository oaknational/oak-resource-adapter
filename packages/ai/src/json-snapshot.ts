import type { JsonObject, JsonValue } from "./protocol.js";

/** Serialises rather than clones, so `structuredClone` is not a substitute. */
export function jsonSnapshot(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function jsonObjectSnapshot(value: unknown): JsonObject {
  const snapshot = jsonSnapshot(value);
  if (!isJsonObject(snapshot)) {
    throw new TypeError("Expected a JSON object.");
  }

  return snapshot;
}
