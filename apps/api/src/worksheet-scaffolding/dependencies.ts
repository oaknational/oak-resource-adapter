import { enqueueJob } from "../jobs/enqueue-job";
import { getLatestJobForConcurrencyKey } from "../jobs/job-repository";
import { getSourceDocument } from "../source-documents/service";
import {
  type AllowanceDependencies,
  allowanceDependencies,
} from "../usage/allowance-service";
import * as scaffoldingRepository from "./repository";

export type WorksheetScaffoldingDependencies = AllowanceDependencies & {
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
  ...allowanceDependencies,
  enqueue: enqueueJob,
  getLatestJob: getLatestJobForConcurrencyKey,
  resumableCutoff: (windowDays) =>
    new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000),
  readSourceDocument: getSourceDocument,
  repository: scaffoldingRepository,
};
