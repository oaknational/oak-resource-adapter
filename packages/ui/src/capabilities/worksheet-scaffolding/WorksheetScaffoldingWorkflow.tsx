"use client";

import {
  OakInlineBanner,
  OakSecondaryButton,
  OakTertiaryButton,
} from "@oaknational/oak-components";
import {
  contributionIdsInDocument,
  type ResourceNode,
} from "@oaknational/resource-document";

import { ResourceAdapterUnavailableMessage } from "../../ResourceAdapterErrorBoundary.js";
import { ResourceDocumentRenderer } from "../../resource-document/ResourceDocumentRenderer.js";
import type { TrackAnalyticsEvent } from "../../analytics.js";
import type {
  GetToken,
  LessonContext,
  ResourceAdapterErrorHandler,
} from "../../publicTypes.js";
import { PendingReviewControls } from "./PendingReviewControls.js";
import { ResumeChoice } from "./ResumeChoice.js";
import { SuggestionGroup, groupSuggestionsByTarget } from "./SuggestionGroup.js";
import { ActionRow } from "./styles.js";
import { useWorksheetScaffolding } from "./useWorksheetScaffolding.js";
import { WorksheetDownload } from "./WorksheetDownload.js";
import {
  LoadingStatusBanner,
  StickyWorkflowStatus,
  WorkflowFrame,
  WorkflowStatusBanner,
} from "./WorkflowStatusBanner.js";
import {
  documentUpdateIsBusy,
  jobIsBusy,
  worksheetWasRefreshed,
} from "./workflowState.js";
import {
  FAILURE_TITLES,
  LOADING_STATUS,
  failureMessage,
  foundNoScaffolds,
  readyStatus,
} from "./workflowStatus.js";

export type WorksheetScaffoldingWorkflowProps = Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onError?: ResourceAdapterErrorHandler;
  track: TrackAnalyticsEvent;
}>;

export function WorksheetScaffoldingWorkflow(props: WorksheetScaffoldingWorkflowProps) {
  const {
    acceptReview,
    applySuggestion,
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

  if (state.status === "idle") {
    return null;
  }

  if (state.status === "loading") {
    return (
      <WorkflowFrame status={LOADING_STATUS}>
        <StickyWorkflowStatus>
          <LoadingStatusBanner
            message={LOADING_STATUS.message}
            title={LOADING_STATUS.title}
          />
        </StickyWorkflowStatus>
      </WorkflowFrame>
    );
  }
  if (state.status === "choosing") {
    return (
      <WorkflowFrame status={null}>
        <ResumeChoice
          onResume={() => resume(state.resumable.adaptationId)}
          onStartFresh={() =>
            startFresh(state.resumable.adaptationId, "start_from_original_button")
          }
          resumable={state.resumable}
        />
      </WorkflowFrame>
    );
  }
  if (state.status === "error") {
    return (
      <WorkflowFrame status={null}>
        <ResourceAdapterUnavailableMessage
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
    <WorkflowFrame status={status}>
      {status !== null && (
        <StickyWorkflowStatus data-testid="worksheet-scaffolding-status">
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
        <StickyWorkflowStatus aria-atomic="true" role="alert">
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
      {state.documentIsVisible && (
        <>
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
        </>
      )}
    </WorkflowFrame>
  );
}
