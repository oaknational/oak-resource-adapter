const UUID_V4_VERSION_BYTE = 6;
const UUID_V4_VARIANT_BYTE = 8;
const UUID_BYTES = 16;

/**
 * Sixteen bytes from the strongest source this runtime offers. `getRandomValues`
 * is available in insecure contexts where `randomUUID` is not, and `crypto`
 * itself is absent from some test and legacy runtimes.
 *
 * The last resort is deliberate: this identifier only has to be distinct per
 * deliberate request, so it is an idempotency discriminator rather than a
 * secret, and nothing downstream treats it as unpredictable.
 */
function randomBytes(source: Crypto | undefined): Uint8Array {
  const bytes = new Uint8Array(UUID_BYTES);
  if (typeof source?.getRandomValues === "function") {
    return source.getRandomValues(bytes);
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function asUuidV4(bytes: Uint8Array): string {
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

/**
 * Never throws. It is called from event handlers, and the API validates the
 * result as a UUID, so every path has to return one rather than fail.
 */
export function newRequestId(): string {
  const source: Crypto | undefined = globalThis.crypto;
  if (typeof source?.randomUUID === "function") {
    return source.randomUUID();
  }

  return asUuidV4(randomBytes(source));
}
