import { describe, expect, it, vi } from "vitest";
import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";

import { createWorksheetAnalyticsTracker } from "./worksheetAnalytics.js";

// Observation reads only these fields, not the worksheet content.
const state = {
  adaptationId: "adaptation-1",
  job: {
    id: "job-1",
    kind: "suggestions.generate",
    status: "succeeded",
    failureMessage: null,
  },
  suggestions: [
    {
      id: "suggestion-1",
      kind: "scaffold-add-word-bank",
      label: "Word bank",
      params: {},
      reason: "Recall",
      targetBlockId: null,
    },
  ],
  pendingReview: null,
} satisfies Pick<
  WorksheetScaffoldingState,
  "adaptationId" | "job" | "suggestions" | "pendingReview"
>;

describe("worksheet analytics observation", () => {
  it("reports suggestions once per generation job per visit", () => {
    const track = vi.fn();
    const analytics = createWorksheetAnalyticsTracker(track);
    analytics.observeDisplay(state);
    analytics.observeDisplay(state);
    expect(track).toHaveBeenCalledOnce();
    analytics.resetDisplays();
    analytics.observeDisplay(state);
    expect(track.mock.calls.map(([event]) => event.name)).toEqual([
      "Suggestions Displayed",
      "Suggestions Displayed",
    ]);
  });

  it("reports a generation that found nothing as displayed with a count of zero", () => {
    const track = vi.fn();
    const analytics = createWorksheetAnalyticsTracker(track);
    analytics.observeDisplay({ ...state, suggestions: [] });
    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Suggestions Displayed",
        componentType: "resource_adapter_dialog",
        suggestionCount: 0,
        transformationKinds: [],
      }),
    );
  });

  it("reports each failed job once, skipping one that failed before resuming", () => {
    const track = vi.fn();
    const analytics = createWorksheetAnalyticsTracker(track);
    const failed = { ...state, job: { ...state.job, status: "failed" as const } };
    analytics.observeJob(state);
    analytics.observeJob(failed);
    analytics.observeJob(failed);
    expect(track).toHaveBeenCalledOnce();
    analytics.ignoreHistoricalJob({ job: { ...failed.job, id: "job-2" } });
    analytics.observeJob({ ...failed, job: { ...failed.job, id: "job-2" } });
    expect(track).toHaveBeenCalledOnce();
  });

  it("still reports a failure of work that was running on resume", () => {
    const track = vi.fn();
    const analytics = createWorksheetAnalyticsTracker(track);
    analytics.ignoreHistoricalJob({ job: { ...state.job, status: "running" } });
    analytics.observeJob({ ...state, job: { ...state.job, status: "failed" } });
    expect(track).toHaveBeenCalledOnce();
  });

  it("reports each preview once per visit and counts a retry's new attempt", () => {
    const track = vi.fn();
    const analytics = createWorksheetAnalyticsTracker(track);
    const preview = {
      ...state,
      job: null,
      suggestions: [],
      pendingReview: {
        attemptId: "attempt-1",
        contributionId: "contribution-1",
        kind: "scaffold-add-word-bank",
        label: "Private label",
        reason: "Private reason",
        targetBlockId: null,
      },
    };
    analytics.observeDisplay(preview);
    analytics.observeDisplay(preview);
    analytics.observeDisplay({
      ...preview,
      pendingReview: { ...preview.pendingReview, attemptId: "attempt-2" },
    });
    expect(track.mock.calls.map(([event]) => event.attemptId)).toEqual([
      "attempt-1",
      "attempt-2",
    ]);
    expect(JSON.stringify(track.mock.calls)).not.toContain("Private");
  });
});
