import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";

import type { TrackAnalyticsEvent } from "../../analytics.js";

export function transformationKinds(
  suggestions: WorksheetScaffoldingState["suggestions"],
): string[] {
  return [...new Set(suggestions.map((suggestion) => suggestion.kind))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function createWorksheetAnalyticsTracker(track: TrackAnalyticsEvent) {
  const reportedFailures = new Set<string>();
  const displayedSuggestions = new Set<string>();
  const displayedPreviews = new Set<string>();

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
  }: Pick<
    WorksheetScaffoldingState,
    "adaptationId" | "job" | "suggestions" | "pendingReview"
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
      });
    }
  }

  function resetDisplays() {
    displayedSuggestions.clear();
    displayedPreviews.clear();
  }

  return { ignoreHistoricalJob, observeJob, observeDisplay, resetDisplays };
}
