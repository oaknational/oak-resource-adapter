import { Storage } from "@google-cloud/storage";

import { readFederatedIdentity, type FederatedIdentity } from "./configuration.js";
import { buildExternalAccountOptions } from "./credentials.js";

let cached: { client: Storage; key: string } | undefined;

function createStorage(identity: FederatedIdentity | null): Storage {
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
  const key = identity
    ? `${identity.workloadIdentityProvider}|${identity.serviceAccount}`
    : "application-default";

  // The impersonated access token is cached inside the auth client, so building
  // a Storage per call would repeat the STS exchange every time.
  if (cached?.key !== key) {
    cached = { client: createStorage(identity), key };
  }

  return cached.client;
}
