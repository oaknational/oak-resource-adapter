import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";

import { enqueueJob } from "../jobs/enqueue-job";
import { getLatestJobForConcurrencyKey } from "../jobs/job-repository";
import { resolveSourceDocumentLocator } from "../source-documents/service";
import { adaptedResourcesSince } from "../usage/adaptation-allowance";
import {
  allowanceDependencies,
  type TeacherAllowanceDependencies,
} from "../usage/allowance-service";
import * as scaffoldingRepository from "./repository";

export type WorksheetScaffoldingDependencies = TeacherAllowanceDependencies & {
  enqueue: typeof enqueueJob;
  getLatestJob: typeof getLatestJobForConcurrencyKey;
  resumableCutoff: (windowDays: number) => Date;
  resolveSourceDocumentLocator: typeof resolveSourceDocumentLocator;
  readSourceDocument: typeof originalResourceDocuments.get;
  repository: WorksheetScaffoldingServiceRepository;
};

export type WorksheetScaffoldingServiceRepository = Pick<
  typeof scaffoldingRepository,
  | "createAdaptationWithSourceDocument"
  | "acceptPendingReview"
  | "findReopenableAdaptation"
  | "findResumableAdaptation"
  | "getAdaptationHead"
  | "getOpenSuggestion"
  | "getPendingReview"
  | "getPrimaryTransformationInput"
  | "isAcceptedContribution"
  | "listOpenSuggestions"
  | "replaceAdaptationWithSourceDocument"
  | "undoPendingReview"
>;

export const defaultDependencies: WorksheetScaffoldingDependencies = {
  ...allowanceDependencies,
  adaptedResourcesSince,
  enqueue: enqueueJob,
  getLatestJob: getLatestJobForConcurrencyKey,
  resumableCutoff: (windowDays) =>
    new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000),
  resolveSourceDocumentLocator,
  readSourceDocument: originalResourceDocuments.get,
  repository: scaffoldingRepository,
};
