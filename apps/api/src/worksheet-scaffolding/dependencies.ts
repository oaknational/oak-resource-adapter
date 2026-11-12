import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";

import { enqueueJob } from "../jobs/enqueue-job";
import { getLatestJobForConcurrencyKey } from "../jobs/job-repository";
import { admitToCapability } from "../capabilities/admission";
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
  admitToCapability: typeof admitToCapability;
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
  admitToCapability,
  readSourceDocument: originalResourceDocuments.get,
  repository: scaffoldingRepository,
};
