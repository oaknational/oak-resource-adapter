import { TRPCClientError } from "@trpc/client";
import type { ResourceDocument } from "@oaknational/resource-document";

import type {
  GetToken,
  LessonContext,
  ResourceAdapterCapabilityId,
} from "./publicTypes.js";
import { createResourceAdapterInternalClient } from "./client.js";
import { ResourceAdapterApiError } from "./errors.js";

export type GetResourceAdapterSourceDocumentOptions = Readonly<{
  apiBaseUrl: string;
  capabilityId: ResourceAdapterCapabilityId;
  getToken: GetToken;
  lesson: LessonContext;
}>;

/**
 * Retrieves the source document owned by an eligible capability. The procedure
 * validates the document against the schema on the way out, so re-parsing it
 * here would only pull the schema package into the host's bundle.
 */
export async function getResourceAdapterSourceDocument({
  apiBaseUrl,
  capabilityId,
  getToken,
  lesson,
}: GetResourceAdapterSourceDocumentOptions): Promise<ResourceDocument> {
  try {
    return await createResourceAdapterInternalClient({
      apiBaseUrl,
      getToken,
    }).sourceDocuments.get.query({ capabilityId, lesson });
  } catch (error) {
    throw new ResourceAdapterApiError(
      "Resource Adapter could not load the source worksheet.",
      error instanceof TRPCClientError ? error.data?.httpStatus : undefined,
    );
  }
}
