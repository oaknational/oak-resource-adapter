import {
  ArtifactStorageRoundTripError,
  roundTripArtifactStorage,
} from "@oaknational/resource-adapter-storage";
import { type NextRequest } from "next/server";

import { getCorsHeaders } from "@/cors";
import {
  createDevOptionsHandler,
  devRouteNotFound,
  devRoutesEnabled,
} from "@/dev-routes";
import { storageEnvironment } from "@/environment";

const allowedMethods = "POST, OPTIONS";

export const OPTIONS = createDevOptionsHandler(allowedMethods);

/**
 * Proves the whole credential chain from a deployment: the pool's condition, the
 * token exchange, the impersonation and the bucket grant.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!devRoutesEnabled()) {
    return devRouteNotFound();
  }

  const headers = new Headers(getCorsHeaders(request, allowedMethods));
  headers.set("Cache-Control", "no-store");
  const environment = storageEnvironment();

  try {
    return Response.json(
      { status: "ok", environment, ...(await roundTripArtifactStorage(environment)) },
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        status: "failed",
        environment,
        message: error instanceof Error ? error.message : "Unknown failure.",
        ...(error instanceof ArtifactStorageRoundTripError
          ? {
              bucket: error.bucket,
              cleanupMessage: error.cleanupMessage,
              federated: error.federated,
              key: error.key,
            }
          : {}),
      },
      { headers, status: 502 },
    );
  }
}
