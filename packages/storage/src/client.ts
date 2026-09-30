import { Storage } from "@google-cloud/storage";

import { readFederatedIdentity, type FederatedIdentity } from "./configuration.js";
import { buildExternalAccountOptions } from "./credentials.js";

let cached: { client: Storage; key: string } | undefined;

function createStorage(
  identity: FederatedIdentity | null,
  emulator: string | undefined,
): Storage {
  if (emulator) {
    const url = new URL(emulator);
    if (
      identity !== null ||
      process.env.VERCEL_ENV ||
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.origin !== emulator
    ) {
      throw new Error(
        "Artifact storage emulation requires a local HTTP origin without federation or Vercel.",
      );
    }
    return new Storage({ apiEndpoint: emulator });
  }
  return identity
    ? new Storage({ credentials: buildExternalAccountOptions(identity) })
    : new Storage();
}

/** Whether federation is configured; this does not attempt a token exchange. */
export function isFederated(): boolean {
  return readFederatedIdentity() !== null;
}

export function getStorage(): Storage {
  const identity = readFederatedIdentity();
  const emulator = process.env.RESOURCE_ARTIFACTS_EMULATOR_ORIGIN;
  const identityKey = identity
    ? `${identity.workloadIdentityProvider}|${identity.serviceAccount}`
    : "application-default";

  const key = `${identityKey}:${emulator ?? ""}`;

  // The impersonated access token is cached inside the auth client, so building
  // a Storage per call would repeat the STS exchange every time.
  if (cached?.key !== key) {
    cached = { client: createStorage(identity, emulator), key };
  }

  return cached.client;
}
