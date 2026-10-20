import type {
  WorksheetScaffoldingEntry,
  WorksheetScaffoldingEntryOutcome,
  WorksheetScaffoldingOpenRequest,
  WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import { type CalendarMonth, ukCalendarMonth } from "../calendar/uk-calendar-month";
import { CAPABILITY } from "./capability";
import {
  defaultDependencies,
  type WorksheetScaffoldingDependencies,
  type WorksheetScaffoldingServiceRepository,
} from "./dependencies";
import type { AdaptationAllowance } from "../usage/adaptation-allowance";
import {
  adaptationAllowanceFor,
  getTeacherAllowance,
} from "../usage/allowance-service";
import type { AdaptationCreationResult } from "./repository";
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

async function createWithinAllowance(
  create: (allowance: AdaptationAllowance) => Promise<AdaptationCreationResult>,
  teacherId: string,
  month: CalendarMonth,
  { access, adaptedResourcesPerMonth }: WorksheetScaffoldingDependencies,
): Promise<AdaptationCreationResult> {
  const limit = adaptedResourcesPerMonth();
  const created = await create(
    adaptationAllowanceFor(await access.resolve(teacherId), month, limit),
  );
  if (created.outcome !== "usageLimitReached") {
    return created;
  }
  // A cached lookup can predate a grant.
  const rechecked = adaptationAllowanceFor(
    await access.recheck(teacherId),
    month,
    limit,
  );
  return rechecked === "unlimited" ? create("unlimited") : created;
}

/** Lesson entry checks current eligibility; calls by adaptation ID use stored work. */
export async function openWorksheetScaffolding(
  request: WorksheetScaffoldingOpenRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingEntry | null> {
  const outcome = await enter(request, target, dependencies);
  return outcome === null
    ? null
    : { ...outcome, allowance: await getTeacherAllowance(target, dependencies) };
}

async function enter(
  request: WorksheetScaffoldingOpenRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies,
): Promise<WorksheetScaffoldingEntryOutcome | null> {
  const { lesson, replacing } = request;
  const { repository } = dependencies;

  const locator = await dependencies.resolveSourceDocumentLocator(
    { capabilityId: CAPABILITY.id, lesson },
    target,
  );
  if (locator === null) {
    return null;
  }

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

  const adaptationInput = {
    capabilityId: CAPABILITY.id,
    document: await dependencies.readSourceDocument(locator),
    lesson,
    teacherId: target.teacherId,
  };
  const create = (allowance: AdaptationAllowance) =>
    replacing === undefined
      ? repository.createAdaptationWithSourceDocument({ ...adaptationInput, allowance })
      : repository.replaceAdaptationWithSourceDocument({
          ...adaptationInput,
          allowance,
          replacingAdaptationId: replacing.adaptationId,
          replacementRequestId: replacing.requestId,
        });
  const month = ukCalendarMonth(dependencies.now());
  const created = await createWithinAllowance(
    create,
    target.teacherId,
    month,
    dependencies,
  );
  if (created.outcome === "usageLimitReached") {
    const usageLimit = {
      kind: "adapted_resources_month",
      retryAt: month.resetsAt.toISOString(),
    } as const;
    console.warn("Usage limit reached", {
      limitKind: usageLimit.kind,
      retryAt: usageLimit.retryAt,
    });
    return { outcome: "usageLimitReached", usageLimit };
  }

  const state = await getWorksheetScaffoldingState(
    created.adaptationId,
    target,
    dependencies,
  );
  return state === null ? null : { outcome: "opened", state };
}
