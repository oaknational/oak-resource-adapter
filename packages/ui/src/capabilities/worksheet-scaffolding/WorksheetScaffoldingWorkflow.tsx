"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  OakInlineBanner,
  OakPrimaryButton,
  OakSecondaryButton,
  OakTertiaryButton,
} from "@oaknational/oak-components";
import {
  contributionIdsInDocument,
  type ResourceNode,
} from "@oaknational/resource-document";

import type { TeacherAllowance } from "@oaknational/resource-adapter-contracts/internal";

import { rememberOnboardingTrip } from "../../onboardingTrip.js";
import { ResourceAdapterUnavailableMessage } from "../../ResourceAdapterErrorBoundary.js";
import { ResourceDocumentRenderer } from "../../resource-document/ResourceDocumentRenderer.js";
import type { TrackAnalyticsEvent } from "../../analytics.js";
import type {
  GetToken,
  LessonContext,
  ResourceAdapterErrorHandler,
} from "../../publicTypes.js";
import { AllowanceSummary } from "./AllowanceSummary.js";
import { LoadingScreen } from "./LoadingScreen.js";
import { PendingReviewControls } from "./PendingReviewControls.js";
import { ResumeChoice } from "./ResumeChoice.js";
import { SuggestionGroup, groupSuggestionsByTarget } from "./SuggestionGroup.js";
import { ActionRow } from "./styles.js";
import { useWorksheetScaffolding } from "./useWorksheetScaffolding.js";
import { WorksheetDownload } from "./WorksheetDownload.js";
import {
  StickyWorkflowStatus,
  WorkflowFrame,
  WorkflowStatusBanner,
} from "./WorkflowStatusBanner.js";
import {
  documentUpdateIsBusy,
  jobIsBusy,
  suggestionGenerationIsBusy,
  type WorkflowState,
  worksheetWasRefreshed,
} from "./workflowState.js";
import {
  FAILURE_TITLES,
  LOADING_STATUS,
  MONTHLY_RESET_STATUS,
  NEEDS_SETUP_STATUS,
  PREPARING_SCAFFOLDS_STATUS,
  failureMessage,
  foundNoScaffolds,
  readyStatus,
  usageLimitStatus,
} from "./workflowStatus.js";

export type WorksheetScaffoldingWorkflowProps = Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onError?: ResourceAdapterErrorHandler;
  onFinishSetup: () => void;
  /** Shows ORA's terms in place of the workflow. */
  onTermsRequired: () => void;
  track: TrackAnalyticsEvent;
}>;

function ResumeChoiceWorkflow({
  allowance,
  frameRef,
  onAllowanceDisplayed,
  onResume,
  onStartFresh,
  state,
}: Readonly<{
  allowance: TeacherAllowance | null;
  frameRef: RefObject<HTMLDivElement | null>;
  onAllowanceDisplayed: (allowance: TeacherAllowance) => void;
  onResume: () => void;
  onStartFresh: () => void;
  state: Extract<WorkflowState, { status: "choosing" }>;
}>) {
  const status = state.usageLimit === null ? null : usageLimitStatus(state.usageLimit);
  return (
    <WorkflowFrame frameRef={frameRef} status={status}>
      {status === null ? (
        <AllowanceSummary allowance={allowance} onDisplayed={onAllowanceDisplayed} />
      ) : (
        <WorkflowStatusBanner cta={null} status={status} />
      )}
      <ResumeChoice
        canStartFresh={state.usageLimit === null}
        onResume={onResume}
        onStartFresh={onStartFresh}
        resumable={state.resumable}
      />
    </WorkflowFrame>
  );
}

function MonthlyLimitWorkflow({
  frameRef,
  onTryAgain,
  state,
}: Readonly<{
  frameRef: RefObject<HTMLDivElement | null>;
  onTryAgain: () => void;
  state: Extract<WorkflowState, { status: "monthlyLimitReached" }>;
}>) {
  const status = state.expired
    ? MONTHLY_RESET_STATUS
    : usageLimitStatus(state.usageLimit);
  return (
    <WorkflowFrame frameRef={frameRef} status={status}>
      <WorkflowStatusBanner
        cta={
          state.expired ? (
            <OakSecondaryButton onClick={onTryAgain}>Try again</OakSecondaryButton>
          ) : null
        }
        status={status}
      />
    </WorkflowFrame>
  );
}

/**
 * The loading screen's heading takes focus, so focus needs a new home when it
 * goes: the next view's target, or else its frame. A view that focuses itself
 * on mount, such as the error message, keeps that focus.
 */
function useFocusAfterLoadingScreen(showing: boolean) {
  const frame = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);
  const wasShowing = useRef(false);
  useEffect(() => {
    if (
      wasShowing.current &&
      !showing &&
      !frame.current?.contains(document.activeElement)
    ) {
      (target.current ?? frame.current)?.focus();
    }
    wasShowing.current = showing;
  }, [showing]);
  return { frame, target };
}

export function WorksheetScaffoldingWorkflow(props: WorksheetScaffoldingWorkflowProps) {
  const {
    acceptReview,
    allowance,
    applySuggestion,
    observeAllowance,
    removeContribution,
    refresh,
    resume,
    retrySuggestions,
    retryTransformationReview,
    startFresh,
    state,
    dismissTarget,
    tryAgain,
    undoReview,
  } = useWorksheetScaffolding(props);
  const showsLoadingScreen =
    state.status === "loading" ||
    (state.status === "ready" && suggestionGenerationIsBusy(state.value));
  const focusAfter = useFocusAfterLoadingScreen(showsLoadingScreen);

  if (state.status === "idle") {
    return null;
  }

  // Loading and preparing share one mounted screen, so its tip and focus carry
  // over when loading leads straight into preparing.
  if (showsLoadingScreen) {
    const status =
      state.status === "loading" ? LOADING_STATUS : PREPARING_SCAFFOLDS_STATUS;
    return (
      <WorkflowFrame frameRef={focusAfter.frame} status={status}>
        <LoadingScreen heading={status.message} />
      </WorkflowFrame>
    );
  }
  if (state.status === "choosing") {
    return (
      <ResumeChoiceWorkflow
        frameRef={focusAfter.frame}
        allowance={allowance}
        onAllowanceDisplayed={observeAllowance}
        onResume={resume}
        onStartFresh={() =>
          startFresh(state.resumable.adaptationId, "start_from_original_button")
        }
        state={state}
      />
    );
  }
  if (state.status === "monthlyLimitReached") {
    return (
      <MonthlyLimitWorkflow
        frameRef={focusAfter.frame}
        onTryAgain={tryAgain}
        state={state}
      />
    );
  }
  if (state.status === "needsSetup") {
    return (
      <WorkflowFrame frameRef={focusAfter.frame} status={NEEDS_SETUP_STATUS}>
        <WorkflowStatusBanner
          cta={
            <OakPrimaryButton
              onClick={() => {
                rememberOnboardingTrip(props.lesson);
                props.onFinishSetup();
              }}
            >
              Finish setup
            </OakPrimaryButton>
          }
          status={NEEDS_SETUP_STATUS}
        />
      </WorkflowFrame>
    );
  }
  if (state.status === "error") {
    return (
      <WorkflowFrame frameRef={focusAfter.frame} status={null}>
        <ResourceAdapterUnavailableMessage
          focusOnMount
          message="Worksheet scaffolding could not be loaded."
          onTryAgain={tryAgain}
          testId="resource-adapter-worksheet-scaffolding-error"
        />
      </WorkflowFrame>
    );
  }

  const { applyingSuggestion } = state;
  const isWorking =
    applyingSuggestion !== null || state.actionIsPending || jobIsBusy(state.value);
  const downloadAvailability =
    state.value.downloadAvailability === "available" &&
    (applyingSuggestion !== null ||
      state.actionIsPending ||
      documentUpdateIsBusy(state.value))
      ? "busy"
      : state.value.downloadAvailability;
  const failedJob = state.value.job?.status === "failed" ? state.value.job : undefined;
  const listedSuggestions =
    applyingSuggestion?.listedSuggestions ?? state.value.suggestions;
  const addedCount = contributionIdsInDocument(state.value.document).length;
  const suggestedCount = listedSuggestions.length;
  const status = readyStatus(
    state.value,
    suggestedCount,
    addedCount,
    applyingSuggestion !== null,
  );
  const suggestionsByTarget = groupSuggestionsByTarget(listedSuggestions);
  const modelWorkRefused = state.value.modelWorkBlocked !== null;

  const renderSuggestionGroup = (targetBlockId: string | null) => {
    const suggestions = suggestionsByTarget.get(targetBlockId);
    return suggestions === undefined ? null : (
      <SuggestionGroup
        applyDisabled={modelWorkRefused}
        applyingSuggestionId={applyingSuggestion?.id ?? null}
        disabled={isWorking}
        onApply={applySuggestion}
        onDismiss={() => dismissTarget(targetBlockId)}
        suggestions={suggestions}
      />
    );
  };

  const { pendingReview } = state.value;
  const decorations = {
    renderAfterNode: (node: ResourceNode) => renderSuggestionGroup(node.id),
    renderContributionControls: (contributionId: string) =>
      pendingReview?.contributionId === contributionId ? (
        <PendingReviewControls
          disabled={isWorking}
          onAccept={acceptReview}
          onRetry={retryTransformationReview}
          onUndo={undoReview}
          reason={pendingReview.reason}
          retryDisabled={modelWorkRefused}
        />
      ) : (
        <OakSecondaryButton
          // Removal waits for the pending scaffold to be accepted or undone.
          disabled={isWorking || pendingReview !== null}
          iconName="trash"
          onClick={() => removeContribution(contributionId)}
        >
          Remove
        </OakSecondaryButton>
      ),
  };

  const hasScaffoldsInDocument = addedCount > 0;
  const hasSuggestedScaffolds = suggestedCount > 0;
  const noScaffoldsFound = foundNoScaffolds(state.value, suggestedCount);

  const canAskForNewSuggestions =
    pendingReview === null &&
    !modelWorkRefused &&
    (hasScaffoldsInDocument || hasSuggestedScaffolds || noScaffoldsFound);
  const showWorkflowCta = canAskForNewSuggestions || hasScaffoldsInDocument;

  const canRetryFailedSuggestions =
    failedJob?.kind === "suggestions.generate" &&
    hasScaffoldsInDocument &&
    pendingReview === null;

  return (
    <WorkflowFrame frameRef={focusAfter.frame} status={status}>
      {status !== null && (
        <StickyWorkflowStatus
          data-testid="worksheet-scaffolding-status"
          ref={failedJob === undefined ? focusAfter.target : undefined}
          tabIndex={-1}
        >
          <WorkflowStatusBanner
            cta={
              showWorkflowCta ? (
                <ActionRow>
                  {canAskForNewSuggestions && (
                    <OakTertiaryButton
                      disabled={isWorking}
                      iconName="ai"
                      onClick={() =>
                        retrySuggestions("generate_new_suggestions_button")
                      }
                    >
                      Generate new suggestions
                    </OakTertiaryButton>
                  )}
                  {hasScaffoldsInDocument && (
                    <OakTertiaryButton
                      disabled={isWorking}
                      iconName="trash"
                      onClick={() =>
                        startFresh(
                          state.value.adaptationId,
                          "remove_all_scaffolds_button",
                        )
                      }
                    >
                      Remove all scaffolds
                    </OakTertiaryButton>
                  )}
                </ActionRow>
              ) : null
            }
            status={status}
          />
        </StickyWorkflowStatus>
      )}
      {failedJob !== undefined && (
        <StickyWorkflowStatus
          aria-atomic="true"
          ref={focusAfter.target}
          role="alert"
          tabIndex={-1}
        >
          <OakInlineBanner
            isOpen
            cta={
              <ActionRow>
                {canRetryFailedSuggestions && (
                  <OakSecondaryButton
                    disabled={isWorking || modelWorkRefused}
                    onClick={() => retrySuggestions("try_again_button")}
                  >
                    Try again
                  </OakSecondaryButton>
                )}
                <OakSecondaryButton onClick={tryAgain}>Start again</OakSecondaryButton>
              </ActionRow>
            }
            message={failureMessage(failedJob.kind, canRetryFailedSuggestions)}
            title={FAILURE_TITLES[failedJob.kind]}
            titleTag="h3"
            type="error"
            variant="regular"
          />
        </StickyWorkflowStatus>
      )}
      <AllowanceSummary allowance={allowance} onDisplayed={observeAllowance} />
      <WorksheetDownload
        apiBaseUrl={props.apiBaseUrl}
        getToken={props.getToken}
        adaptationId={state.value.adaptationId}
        resourceDocumentId={state.value.resourceDocumentId}
        availability={downloadAvailability}
        onRefresh={refresh}
        worksheetWasRefreshed={worksheetWasRefreshed(state)}
        onError={props.onError}
        track={props.track}
      />
      {renderSuggestionGroup(null)}
      <ResourceDocumentRenderer
        decorations={decorations}
        document={state.value.document}
      />
    </WorkflowFrame>
  );
}
