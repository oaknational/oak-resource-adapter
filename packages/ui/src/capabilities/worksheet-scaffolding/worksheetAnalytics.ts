import type {
  TeacherAllowance,
  UsageLimitReached,
  WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";

import type {
  AdaptationRequest,
  CapabilityAnalyticsEvent,
  TrackAnalyticsEvent,
} from "../../analytics.js";

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function transformationKinds(
  suggestions: WorksheetScaffoldingState["suggestions"],
): string[] {
  return sortedUnique(suggestions.map((suggestion) => suggestion.kind));
}

export type ScaffoldingAction =
  "accept" | "dismiss" | "remove" | "retrySuggestions" | "retryTransformation" | "undo";

export type ComponentTypeFor<Name extends CapabilityAnalyticsEvent["name"]> = Extract<
  CapabilityAnalyticsEvent,
  { name: Name; componentType: string }
>["componentType"];

export type TrackedRequest = AdaptationRequest & Readonly<{ adaptationId: string }>;

export function requestFor(action: ScaffoldingAction): AdaptationRequest {
  if (action === "retrySuggestions") {
    return { requestAction: "retry", retryTarget: "suggestions" } as const;
  }
  if (action === "retryTransformation") {
    return { requestAction: "retry", retryTarget: "transformation" } as const;
  }
  return { requestAction: action };
}

const REVIEW_CONTROLS = {
  accept: "accept_button",
  retry: "retry_button",
  undo: "undo_button",
} as const;

function reviewDetails<Action extends keyof typeof REVIEW_CONTROLS>(
  { adaptationId, pendingReview }: WorksheetScaffoldingState,
  reviewAction: Action,
) {
  return pendingReview === null
    ? null
    : {
        adaptationId,
        componentType: REVIEW_CONTROLS[reviewAction],
        reviewAction,
        transformationKind: pendingReview.kind,
        ...(pendingReview.supportLevel === null
          ? {}
          : { supportLevel: pendingReview.supportLevel }),
      };
}

export function reviewRequestedEvent(
  value: WorksheetScaffoldingState,
  reviewAction: keyof typeof REVIEW_CONTROLS,
): CapabilityAnalyticsEvent | null {
  const details = reviewDetails(value, reviewAction);
  return details && { name: "Transformation Review Requested", ...details };
}

export function reviewedEvent(
  value: WorksheetScaffoldingState,
  reviewAction: "accept" | "undo",
): CapabilityAnalyticsEvent | null {
  const details = reviewDetails(value, reviewAction);
  return details && { name: "Transformation Reviewed", ...details };
}

export function createWorksheetAnalyticsTracker(track: TrackAnalyticsEvent) {
  const reportedFailures = new Set<string>();
  const displayedSuggestions = new Set<string>();
  const displayedPreviews = new Set<string>();
  const displayedWithheld = new Set<string>();
  const displayedAllowances = new Set<string>();

  function ignoreHistoricalJob({ job }: Pick<WorksheetScaffoldingState, "job">) {
    if (job?.status === "failed") reportedFailures.add(job.id);
  }

  function observeJob({
    adaptationId,
    job,
  }: Pick<WorksheetScaffoldingState, "adaptationId" | "job">) {
    if (job?.status !== "failed" || reportedFailures.has(job.id)) return;
    reportedFailures.add(job.id);
    track({
      name: "Adaptation Step Failed",
      componentType: "resource_adapter_dialog",
      adaptationId,
      jobId: job.id,
      jobKind: job.kind,
    });
  }

  function observeDisplay({
    adaptationId,
    job,
    suggestions,
    pendingReview,
    withheld,
  }: Pick<
    WorksheetScaffoldingState,
    "adaptationId" | "job" | "suggestions" | "pendingReview" | "withheld"
  >) {
    if (
      job?.kind === "suggestions.generate" &&
      job.status === "succeeded" &&
      !displayedSuggestions.has(job.id)
    ) {
      displayedSuggestions.add(job.id);
      track({
        name: "Suggestions Displayed",
        componentType: "resource_adapter_dialog",
        adaptationId,
        jobId: job.id,
        suggestionCount: suggestions.length,
        transformationKinds: transformationKinds(suggestions),
      });
    }
    if (pendingReview !== null && !displayedPreviews.has(pendingReview.attemptId)) {
      displayedPreviews.add(pendingReview.attemptId);
      track({
        name: "Transformation Preview Displayed",
        componentType: "resource_adapter_dialog",
        adaptationId,
        attemptId: pendingReview.attemptId,
        transformationKind: pendingReview.kind,
        ...(pendingReview.supportLevel === null
          ? {}
          : { supportLevel: pendingReview.supportLevel }),
      });
      if (pendingReview.contentGuidance.length > 0) {
        track({
          name: "Content Guidance Displayed",
          componentType: "resource_adapter_dialog",
          adaptationId,
          attemptId: pendingReview.attemptId,
          transformationKind: pendingReview.kind,
          moderationCategories: sortedUnique(
            pendingReview.contentGuidance.map(({ category }) => category),
          ),
        });
      }
    }
    if (withheld !== null && !displayedWithheld.has(withheld.attemptId)) {
      displayedWithheld.add(withheld.attemptId);
      track({
        name: "Scaffold Withheld",
        componentType: "resource_adapter_dialog",
        adaptationId,
        attemptId: withheld.attemptId,
        transformationKind: withheld.kind,
        safetyResult: withheld.safetyResult,
        moderationCategories: sortedUnique(withheld.moderationCategories),
      });
    }
  }

  function observeUsageLimit(
    usageLimit: UsageLimitReached | null,
    request: AdaptationRequest & Readonly<{ adaptationId?: string }>,
  ) {
    if (usageLimit === null) return;
    track({
      name: "Usage Limit Reached",
      componentType: "resource_adapter_dialog",
      limitKind: usageLimit.kind,
      ...request,
    });
  }

  function observeAllowance(allowance: TeacherAllowance) {
    if (allowance.tier !== "limited") return;
    const key = `${allowance.limit}:${allowance.remaining}`;
    if (displayedAllowances.has(key)) return;
    displayedAllowances.add(key);
    track({
      name: "Monthly Allowance Displayed",
      componentType: "resource_adapter_dialog",
      allowanceLimit: allowance.limit,
      allowanceRemaining: allowance.remaining,
    });
  }

  function resetDisplays() {
    displayedSuggestions.clear();
    displayedPreviews.clear();
    displayedWithheld.clear();
    displayedAllowances.clear();
  }

  return {
    ignoreHistoricalJob,
    observeAllowance,
    observeDisplay,
    observeJob,
    observeUsageLimit,
    resetDisplays,
  };
}
