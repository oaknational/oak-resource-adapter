import { enqueueJob } from "../jobs/enqueue-job";
import { getLatestJobForConcurrencyKey } from "../jobs/job-repository";
import { getSourceDocument } from "../source-documents/service";
import * as scaffoldingRepository from "./repository";

export type WorksheetScaffoldingDependencies = {
  enqueue: typeof enqueueJob;
  getLatestJob: typeof getLatestJobForConcurrencyKey;
  resumableCutoff: (windowDays: number) => Date;
  readSourceDocument: typeof getSourceDocument;
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
  enqueue: enqueueJob,
  getLatestJob: getLatestJobForConcurrencyKey,
  resumableCutoff: (windowDays) =>
    new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000),
  readSourceDocument: getSourceDocument,
  repository: scaffoldingRepository,
};
