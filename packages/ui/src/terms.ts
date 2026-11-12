import type {
  TermsAcceptRequest,
  TermsState,
} from "@oaknational/resource-adapter-contracts/internal";

import {
  callApi,
  createResourceAdapterInternalClient,
  type CreateResourceAdapterClientOptions,
} from "./client.js";

export function getTermsState(
  options: CreateResourceAdapterClientOptions,
): Promise<TermsState> {
  return callApi("Resource Adapter could not check the teacher's terms.", () =>
    createResourceAdapterInternalClient(options).terms.get.query(),
  );
}

export function acceptTerms(
  options: CreateResourceAdapterClientOptions & TermsAcceptRequest,
): Promise<TermsState> {
  return callApi("Resource Adapter could not record the teacher's terms.", () =>
    createResourceAdapterInternalClient(options).terms.accept.mutate({
      version: options.version,
    }),
  );
}
