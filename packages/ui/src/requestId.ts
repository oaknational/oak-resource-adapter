const UUID_V4_VERSION_BYTE = 6;
const UUID_V4_VARIANT_BYTE = 8;

/**
 * `crypto.randomUUID` is restricted to secure contexts, so it is absent when the
 * host is served over plain HTTP to a test device. `getRandomValues` is not, and
 * the API validates these as UUIDs, so fall back to building one rather than
 * throwing inside a click handler.
 */
export function newRequestId(): string {
  const { crypto } = globalThis;
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[UUID_V4_VERSION_BYTE] = ((bytes[UUID_V4_VERSION_BYTE] ?? 0) & 0x0f) | 0x40;
  bytes[UUID_V4_VARIANT_BYTE] = ((bytes[UUID_V4_VARIANT_BYTE] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
