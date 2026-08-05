import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import {
  resourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";
import type {
  HostRouter,
  InternalRouter,
} from "@oaknational/resource-adapter-contracts/server";

import type { GetToken } from "./publicTypes.js";

export type ResourceAdapterPublicApiClient = TRPCClient<HostRouter>;
export type ResourceAdapterInternalApiClient = TRPCClient<InternalRouter>;

export type CreateResourceAdapterClientOptions = Readonly<{
  getToken: GetToken;
  trpcEndpoint: string;
}>;

type CreateClientOptions = CreateResourceAdapterClientOptions &
  Readonly<{ extraHeaders?: Readonly<Record<string, string>> }>;

function createLinkOptions({
  extraHeaders,
  getToken,
  trpcEndpoint,
}: CreateClientOptions) {
  return {
    headers: async () => {
      const token = await getToken();

      return {
        ...extraHeaders,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
    },
    methodOverride: "POST" as const,
    url: trpcEndpoint,
  };
}

/**
 * Creates a typed tRPC client for the public API (capabilities).
 * Includes the contract version header.
 */
export function createResourceAdapterClient(
  options: CreateResourceAdapterClientOptions,
): ResourceAdapterPublicApiClient {
  return createTRPCClient<HostRouter>({
    links: [
      httpBatchLink(
        createLinkOptions({
          ...options,
          extraHeaders: {
            [resourceAdapterApiContractVersionHeader]: String(
              resourceAdapterApiContractVersion,
            ),
          },
        }),
      ),
    ],
  });
}

/**
 * Creates a typed tRPC client for the internal API (feature flags and other UI-private procedures).
 * Does not include the contract version header (internal APIs are unversioned).
 */
export function createResourceAdapterInternalClient(
  options: CreateResourceAdapterClientOptions,
): ResourceAdapterInternalApiClient {
  return createTRPCClient<InternalRouter>({
    links: [httpBatchLink(createLinkOptions(options))],
  });
}
