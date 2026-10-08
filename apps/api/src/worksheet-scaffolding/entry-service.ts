import type {
  WorksheetScaffoldingEntry,
  WorksheetScaffoldingOpenRequest,
  WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import { CAPABILITY } from "./capability";
import {
  defaultDependencies,
  type WorksheetScaffoldingDependencies,
  type WorksheetScaffoldingServiceRepository,
} from "./dependencies";
import { getWorksheetScaffoldingState } from "./service";

const RESUMABLE_WINDOW_DAYS = 30;

/** Reopen unless a failure left nothing to do but start again. */
async function reopen(
  query: Parameters<
    WorksheetScaffoldingServiceRepository["findReopenableAdaptation"]
  >[0],
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies,
): Promise<WorksheetScaffoldingState | null> {
  const reopenable = await dependencies.repository.findReopenableAdaptation(query);
  if (reopenable === null) {
    return null;
  }
  const state = await getWorksheetScaffoldingState(reopenable.id, target, dependencies);
  return state?.job?.status === "failed" && state.suggestions.length === 0
    ? null
    : state;
}

export async function openWorksheetScaffolding(
  request: WorksheetScaffoldingOpenRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingEntry | null> {
  const { lesson, replacing } = request;
  const { repository } = dependencies;

  if (replacing === undefined) {
    const recentAdaptationsOfLesson = {
      capabilityId: CAPABILITY.id,
      lesson,
      notBefore: dependencies.resumableCutoff(RESUMABLE_WINDOW_DAYS),
      teacherId: target.teacherId,
    };
    const resumable = await repository.findResumableAdaptation(
      recentAdaptationsOfLesson,
    );
    if (resumable !== null) {
      return {
        outcome: "resumable",
        resumable: {
          adaptationId: resumable.id,
          pendingScaffoldCount: resumable.pendingScaffoldCount,
          scaffoldCount: resumable.scaffoldCount,
          updatedAt: resumable.updatedAt.toISOString(),
        },
      };
    }

    const reopened = await reopen(recentAdaptationsOfLesson, target, dependencies);
    if (reopened !== null) {
      return { outcome: "reopened", state: reopened };
    }
  }

  const document = await dependencies.readSourceDocument(
    { capabilityId: CAPABILITY.id, lesson },
    target,
  );
  if (document === null) {
    return null;
  }

  const adaptationInput = {
    capabilityId: CAPABILITY.id,
    document,
    lesson,
    teacherId: target.teacherId,
  };
  const { adaptationId } =
    replacing === undefined
      ? await repository.createAdaptationWithSourceDocument(adaptationInput)
      : await repository.replaceAdaptationWithSourceDocument({
          ...adaptationInput,
          replacingAdaptationId: replacing.adaptationId,
          replacementRequestId: replacing.requestId,
        });

  const state = await getWorksheetScaffoldingState(adaptationId, target, dependencies);
  return state === null ? null : { outcome: "opened", state };
}
