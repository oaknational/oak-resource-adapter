import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import {
  resourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";
import type { InternalRouter } from "@oaknational/resource-adapter-contracts/internal/server";
import type { HostRouter } from "@oaknational/resource-adapter-contracts/server";

import type { GetToken } from "./publicTypes.js";

export type ResourceAdapterPublicApiClient = TRPCClient<HostRouter>;
export type ResourceAdapterInternalApiClient = TRPCClient<InternalRouter>;

export type CreateResourceAdapterClientOptions = Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
}>;

function normalizeApiBaseUrl(url: string): string {
  let normalized = url.trim();
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  if (!normalized) {
    throw new Error("apiBaseUrl must be a non-empty absolute http(s) URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("apiBaseUrl must be a valid absolute http(s) URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("apiBaseUrl must use http or https.");
  }

  return normalized;
}

type CreateLinkOptions = Readonly<{
  extraHeaders?: Readonly<Record<string, string>>;
  getToken: GetToken;
  url: string;
}>;

function createLinkOptions({ extraHeaders, getToken, url }: CreateLinkOptions) {
  return {
    headers: async () => {
      const token = await getToken();

      return {
        ...extraHeaders,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
    },
    methodOverride: "POST" as const,
    url,
  };
}

/**
 * Creates a typed tRPC client for the public API (capabilities).
 * Includes the contract version header.
 */
export function createResourceAdapterClient({
  apiBaseUrl,
  getToken,
}: CreateResourceAdapterClientOptions): ResourceAdapterPublicApiClient {
  const base = normalizeApiBaseUrl(apiBaseUrl);
  return createTRPCClient<HostRouter>({
    links: [
      httpBatchLink(
        createLinkOptions({
          getToken,
          url: `${base}/trpc/v1`,
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
export function createResourceAdapterInternalClient({
  apiBaseUrl,
  getToken,
}: CreateResourceAdapterClientOptions): ResourceAdapterInternalApiClient {
  const base = normalizeApiBaseUrl(apiBaseUrl);
  return createTRPCClient<InternalRouter>({
    links: [
      httpBatchLink(createLinkOptions({ getToken, url: `${base}/trpc/internal` })),
    ],
  });
}
