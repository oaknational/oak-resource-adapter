import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import {
  resourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";
import type { AppRouterV1 } from "@oaknational/resource-adapter-contracts/server";

import type { GetToken } from "./publicTypes.js";

export type ResourceAdapterApiClient = TRPCClient<AppRouterV1>;

export type CreateResourceAdapterClientOptions = Readonly<{
  getToken: GetToken;
  trpcEndpoint: string;
}>;

/**
 * Creates the supported typed client for Resource Adapter service calls from
 * the published UI package, OWA, or the local harness.
 */
export function createResourceAdapterClient({
  getToken,
  trpcEndpoint,
}: CreateResourceAdapterClientOptions): ResourceAdapterApiClient {
  return createTRPCClient<AppRouterV1>({
    links: [
      httpBatchLink({
        headers: async () => {
          const token = await getToken();

          return {
            [resourceAdapterApiContractVersionHeader]: String(
              resourceAdapterApiContractVersion,
            ),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          };
        },
        methodOverride: "POST",
        url: trpcEndpoint,
      }),
    ],
  });
}
