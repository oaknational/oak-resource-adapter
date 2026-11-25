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
  withheld: null,
} satisfies Pick<
  WorksheetScaffoldingState,
  "adaptationId" | "job" | "suggestions" | "pendingReview" | "withheld"
>;

const preview = {
  attemptId: "attempt-1",
  contentGuidance: [],
  contributionId: "contribution-1",
  kind: "scaffold-add-word-bank",
  label: "Shown label",
  reason: "Shown reason",
  supportLevel: "low",
  targetBlockId: null,
} satisfies NonNullable<WorksheetScaffoldingState["pendingReview"]>;

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
    const previewing = { ...state, job: null, suggestions: [], pendingReview: preview };
    analytics.observeDisplay(previewing);
    analytics.observeDisplay(previewing);
    analytics.observeDisplay({
      ...previewing,
      pendingReview: { ...preview, attemptId: "attempt-2" },
    });
    expect(track.mock.calls.map(([event]) => event.attemptId)).toEqual([
      "attempt-1",
      "attempt-2",
    ]);
    expect(JSON.stringify(track.mock.calls)).not.toContain("Shown");
  });

  it("reports a preview's guidance once per visit, as sorted codes without labels", () => {
    const track = vi.fn();
    const analytics = createWorksheetAnalyticsTracker(track);
    const guided = {
      ...state,
      job: null,
      suggestions: [],
      pendingReview: {
        ...preview,
        contentGuidance: [
          { category: "u/sensitive-content", label: "Shown guidance" },
          { category: "l/offensive-language", label: "Shown guidance" },
          { category: "u/sensitive-content", label: "Shown guidance" },
        ],
      },
    };
    analytics.observeDisplay(guided);
    analytics.observeDisplay(guided);
    analytics.resetDisplays();
    analytics.observeDisplay(guided);

    const guidance = track.mock.calls
      .map(([event]) => event)
      .filter(({ name }) => name === "Content Guidance Displayed");
    expect(guidance).toEqual([
      {
        name: "Content Guidance Displayed",
        componentType: "resource_adapter_dialog",
        adaptationId: "adaptation-1",
        attemptId: "attempt-1",
        transformationKind: "scaffold-add-word-bank",
        moderationCategories: ["l/offensive-language", "u/sensitive-content"],
      },
      expect.objectContaining({ name: "Content Guidance Displayed" }),
    ]);
    expect(JSON.stringify(track.mock.calls)).not.toContain("Shown");
  });

  it("reports each withheld scaffold once per visit", () => {
    const track = vi.fn();
    const analytics = createWorksheetAnalyticsTracker(track);
    const withholding = {
      ...state,
      job: null,
      suggestions: [],
      withheld: {
        attemptId: "attempt-1",
        kind: "scaffold-add-sentence-starters",
        moderationCategories: [
          "t/using-creating-weapons",
          "t/encourages-violence-harm-others",
        ],
        safetyResult: "toxic" as const,
        targetBlockId: "question-1",
      },
    };
    analytics.observeDisplay(withholding);
    analytics.observeDisplay(withholding);
    analytics.resetDisplays();
    analytics.observeDisplay(withholding);
    analytics.observeDisplay({
      ...withholding,
      withheld: { ...withholding.withheld, attemptId: "attempt-2" },
    });

    expect(track.mock.calls.map(([event]) => event.attemptId)).toEqual([
      "attempt-1",
      "attempt-1",
      "attempt-2",
    ]);
    expect(track).toHaveBeenNthCalledWith(1, {
      name: "Scaffold Withheld",
      componentType: "resource_adapter_dialog",
      adaptationId: "adaptation-1",
      attemptId: "attempt-1",
      transformationKind: "scaffold-add-sentence-starters",
      safetyResult: "toxic",
      moderationCategories: [
        "t/encourages-violence-harm-others",
        "t/using-creating-weapons",
      ],
    });
  });
});
