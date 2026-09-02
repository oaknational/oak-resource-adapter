"use client";

import { useId, useState, type ReactNode } from "react";
import {
  OakFlex,
  OakHeading,
  OakIcon,
  OakInlineBanner,
  OakP,
  OakPrimaryButton,
  OakSecondaryButton,
  OakTertiaryButton,
  parseColor,
} from "@oaknational/oak-components";
import type {
  WorksheetScaffoldingJobKind,
  WorksheetScaffoldingResumable,
  WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";
import {
  contributionIdsInDocument,
  type ResourceNode,
} from "@oaknational/resource-document";
import { keyframes, styled } from "styled-components";

import { ResourceAdapterUnavailableMessage } from "../../ResourceAdapterErrorBoundary.js";
import { ResourceDocumentRenderer } from "../../resource-document/ResourceDocumentRenderer.js";
import type {
  GetToken,
  LessonContext,
  ResourceAdapterErrorHandler,
} from "../../publicTypes.js";
import {
  jobIsBusy,
  useWorksheetScaffolding,
  type ApplyingSuggestion,
  type WorkflowState,
} from "./useWorksheetScaffolding.js";

export type WorksheetScaffoldingWorkflowProps = Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onError?: ResourceAdapterErrorHandler;
}>;

type WorkflowStatus = Readonly<{
  message: string;
  title?: string;
  tone: "info" | "neutral" | "working";
}>;

const LOADING_STATUS = {
  message: "Getting your worksheet ready.",
  title: "Loading worksheet",
  tone: "working",
} as const satisfies WorkflowStatus;

const SuggestionGroup = styled.div`
  background: ${parseColor("bg-neutral")};
  border: 1px solid ${parseColor("border-neutral-lighter")};
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0.5rem 0 1rem;
  padding: 0.75rem;

  /* Keeps a focused button clear of the sticky status banner above it. */
  button {
    scroll-margin-top: 7rem;
  }
`;

const SuggestionList = styled.ul`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  list-style: none;
  margin: 0;
  padding: 0;

  button {
    min-height: 3.5rem;
  }
`;

const ReviewDisclosure = styled.button`
  align-items: center;
  background: none;
  border: 0;
  color: ${parseColor("text-link-active")};
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-weight: 700;
  gap: 0.5rem;
  min-height: 1.5rem;
  padding: 0;
  text-align: left;
  text-decoration: underline;

  &:focus-visible {
    outline: 0.1875rem solid ${parseColor("border-inverted")};
    outline-offset: 0.125rem;
  }
`;

const ReviewChevron = styled(OakIcon)<{ $isOpen: boolean }>`
  flex: 0 0 auto;
  transform: rotate(${({ $isOpen }) => ($isOpen ? "180deg" : "0deg")});
  transition: transform 0.2s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ReviewActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const SuggestionItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const LocalWorking = styled.div`
  align-items: center;
  display: flex;
  gap: 0.75rem;
  min-height: 3rem;
`;

const StickyWorkflowStatus = styled.div`
  position: sticky;
  top: 0;
  z-index: 1;

  &:focus {
    outline: none;
  }
`;

const StatusAnnouncement = styled.span`
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
`;

const rotateLoadingSpinner = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const VisibleLoadingSpinner = styled.span`
  animation: ${rotateLoadingSpinner} 1.2s linear infinite;
  border: 0.1875rem solid ${parseColor("icon-primary")};
  border-radius: 50%;
  border-right-color: transparent;
  box-sizing: border-box;
  display: block;
  height: 1.5rem;
  width: 1.5rem;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

function LoadingStatusBanner({
  message,
  title,
}: Readonly<{ message: string; title: string }>) {
  return (
    <OakFlex
      $alignItems="flex-start"
      $background="bg-decorative3-very-subdued"
      $ba="border-solid-s"
      $borderColor="border-decorative3"
      $borderRadius="border-radius-m"
      $gap="spacing-12"
      $pa="spacing-16"
    >
      <OakFlex
        $alignItems="center"
        $flexShrink={0}
        $height="spacing-32"
        $justifyContent="center"
        $width="spacing-32"
        aria-hidden="true"
      >
        <VisibleLoadingSpinner data-testid="worksheet-scaffolding-loading-spinner" />
      </OakFlex>
      <OakFlex $flexDirection="column" $gap="spacing-4" $width="100%">
        <OakHeading $font="heading-7" tag="h3">
          {title}
        </OakHeading>
        <OakP $font="body-2">{message}</OakP>
      </OakFlex>
    </OakFlex>
  );
}

function scaffoldSummary(count: number): string {
  return count === 1 ? "1 scaffold" : `${count} scaffolds`;
}

function pendingReviewSentence(count: number): string {
  if (count === 0) {
    return "";
  }
  return count === 1
    ? "One scaffold is waiting for your review."
    : `${count} scaffolds are waiting for your review.`;
}

function suggestedSentence(count: number): string {
  if (count === 0) {
    return "There are no suggested scaffolds for this worksheet.";
  }
  if (count === 1) {
    return "There is one suggested scaffold for this worksheet.";
  }
  return `There are ${count} suggested scaffolds for this worksheet.`;
}

function addedSentence(count: number): string {
  if (count === 0) {
    return "";
  }
  return count === 1
    ? "One scaffold has been added."
    : `${count} scaffolds have been added.`;
}

function scaffoldStatusMessage(suggestedCount: number, addedCount: number): string {
  return [suggestedSentence(suggestedCount), addedSentence(addedCount)]
    .filter((sentence) => sentence !== "")
    .join(" ");
}

function workflowStatus(
  state: WorkflowState,
  suggestedCount: number,
  addedCount: number,
  hasLocalProgress: boolean,
): WorkflowStatus | null {
  if (state.status === "loading") {
    return LOADING_STATUS;
  }
  if (state.status !== "ready") {
    return null;
  }
  return readyStatus(state.value, suggestedCount, addedCount, hasLocalProgress);
}

/** One entry per job kind, so a new kind cannot silently lose its progress status. */
const BUSY_STATUSES = {
  "suggestions.apply": {
    message: "Updating the worksheet with your chosen scaffold.",
    title: "Applying scaffold",
    tone: "working",
  },
  "suggestions.generate": {
    message: "Reviewing the worksheet for useful scaffolds.",
    title: "Considering scaffold selections for practice tasks",
    tone: "working",
  },
  "transformations.dismiss": {
    message: "Updating the worksheet's scaffold choices.",
    title: "Updating scaffold choices",
    tone: "working",
  },
  "transformations.remove": {
    message: "Updating the worksheet and finding new scaffold suggestions.",
    title: "Removing scaffold",
    tone: "working",
  },
  "transformations.retry": {
    message: "Creating another version of this scaffold.",
    title: "Trying scaffold again",
    tone: "working",
  },
} as const satisfies Record<WorksheetScaffoldingJobKind, WorkflowStatus>;

const FAILURE_TITLES = {
  "suggestions.apply": "We couldn't apply that scaffold",
  "suggestions.generate": "We couldn't find scaffolds",
  "transformations.dismiss": "We couldn't update your scaffold choices",
  "transformations.remove": "We couldn't remove that scaffold",
  "transformations.retry": "We couldn't try that scaffold again",
} as const satisfies Record<WorksheetScaffoldingJobKind, string>;

function failureMessage(kind: WorksheetScaffoldingJobKind): string {
  return kind === "transformations.retry"
    ? "You can retry again, accept this version, undo it, or start again."
    : "Start again to reopen the original worksheet.";
}

function readyStatus(
  state: WorksheetScaffoldingState,
  suggestedCount: number,
  addedCount: number,
  hasLocalProgress: boolean,
): WorkflowStatus | null {
  // A spinner beside the chosen suggestion reports that application itself, so the
  // banner keeps the standing summary rather than repeating the same progress.
  const reportedLocally = hasLocalProgress && state.job?.kind === "suggestions.apply";
  if (state.job !== null && jobIsBusy(state) && !reportedLocally) {
    return BUSY_STATUSES[state.job.kind];
  }
  if (state.job?.status === "failed") {
    return null;
  }
  if (suggestedCount > 0 || addedCount > 0) {
    return {
      message: scaffoldStatusMessage(suggestedCount, addedCount),
      tone: "info",
    };
  }
  if (state.job?.kind === "suggestions.generate" && state.job.status === "succeeded") {
    return {
      message:
        "We didn't find a useful scaffold for this worksheet. It may already give pupils the support they need.",
      title: "No scaffolds suggested",
      tone: "neutral",
    };
  }
  return null;
}

function WorkflowStatusBanner({
  cta,
  status,
}: Readonly<{ cta: ReactNode; status: WorkflowStatus }>) {
  if (status.tone === "working") {
    return (
      <LoadingStatusBanner message={status.message} title={status.title ?? "Working"} />
    );
  }

  return (
    <OakInlineBanner
      isOpen
      cta={cta}
      icon="ai"
      message={status.message}
      {...(status.title === undefined ? {} : { title: status.title })}
      titleTag="h3"
      type={status.tone}
      variant="regular"
    />
  );
}

function PendingReviewControls({
  disabled,
  onAccept,
  onRetry,
  onUndo,
  reason,
}: Readonly<{
  disabled: boolean;
  onAccept: () => void;
  onRetry: () => void;
  onUndo: () => void;
  reason: string;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <OakFlex $flexDirection="column" $gap="spacing-12">
      <div>
        <ReviewDisclosure
          aria-controls={panelId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          How this can support your pupils
          <ReviewChevron
            $height="spacing-24"
            $isOpen={isOpen}
            $width="spacing-24"
            alt=""
            aria-hidden="true"
            iconName="chevron-down"
          />
        </ReviewDisclosure>
      </div>
      <OakP hidden={!isOpen} id={panelId}>
        {reason}
      </OakP>
      <ReviewActions>
        <OakSecondaryButton disabled={disabled} iconName="arrow-left" onClick={onUndo}>
          Undo
        </OakSecondaryButton>
        <OakSecondaryButton disabled={disabled} iconName="retake" onClick={onRetry}>
          Retry
        </OakSecondaryButton>
        <OakPrimaryButton disabled={disabled} onClick={onAccept}>
          Accept
        </OakPrimaryButton>
      </ReviewActions>
    </OakFlex>
  );
}

function ResumeChoice({
  onResume,
  onStartFresh,
  resumable,
}: Readonly<{
  onResume: () => void;
  onStartFresh: () => void;
  resumable: WorksheetScaffoldingResumable;
}>) {
  const lastWorkedOn = new Date(resumable.updatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });

  return (
    <OakFlex
      $background="bg-decorative3-very-subdued"
      $ba="border-solid-s"
      $borderColor="border-decorative3"
      $borderRadius="border-radius-m"
      $flexDirection="column"
      $gap="spacing-12"
      $pa="spacing-16"
    >
      <OakHeading $font="heading-6" tag="h3">
        Carry on with this worksheet?
      </OakHeading>
      <OakP $font="body-2">
        {[
          `This worksheet has ${scaffoldSummary(resumable.scaffoldCount)} from ${lastWorkedOn}.`,
          pendingReviewSentence(resumable.pendingScaffoldCount),
          "You can keep going, or start again from Oak’s original.",
        ]
          .filter((sentence) => sentence !== "")
          .join(" ")}
      </OakP>
      <OakFlex $flexWrap="wrap" $gap="spacing-8">
        <OakPrimaryButton onClick={onResume}>Carry on</OakPrimaryButton>
        <OakSecondaryButton onClick={onStartFresh}>
          Start from the original
        </OakSecondaryButton>
      </OakFlex>
    </OakFlex>
  );
}

export function WorksheetScaffoldingWorkflow(props: WorksheetScaffoldingWorkflowProps) {
  const {
    acceptReview,
    actionInFlight,
    applicationStatusRef,
    applySuggestion,
    applyingSuggestion,
    documentIsVisible,
    removeContribution,
    resume,
    retryReview,
    startFresh,
    state,
    dismissTarget,
    tryAgain,
    undoReview,
  } = useWorksheetScaffolding(props);
  const groupIdPrefix = useId();

  if (state.status === "idle") {
    return null;
  }

  // A region mounted alongside its own text is announced unreliably, whereas changing
  // the text of a mounted region is not, so every branch renders this same region.
  const announcement = (status: WorkflowStatus | null) => (
    <StatusAnnouncement aria-atomic="true" aria-live="polite" role="status">
      {status === null
        ? ""
        : [status.title, status.message]
            .filter((part) => part !== undefined)
            .join(". ")}
    </StatusAnnouncement>
  );

  if (state.status === "loading") {
    return (
      <>
        {announcement(LOADING_STATUS)}
        <StickyWorkflowStatus>
          <LoadingStatusBanner
            message={LOADING_STATUS.message}
            title={LOADING_STATUS.title}
          />
        </StickyWorkflowStatus>
      </>
    );
  }
  if (state.status === "choosing") {
    return (
      <>
        {announcement(null)}
        <ResumeChoice
          onResume={() => resume(state.resumable.adaptationId)}
          onStartFresh={() => startFresh(state.resumable.adaptationId)}
          resumable={state.resumable}
        />
      </>
    );
  }
  if (state.status === "error") {
    return (
      <>
        {announcement(null)}
        <ResourceAdapterUnavailableMessage
          message="Worksheet scaffolding could not be loaded."
          onTryAgain={tryAgain}
          testId="resource-adapter-worksheet-scaffolding-error"
        />
      </>
    );
  }

  const isWorking =
    applyingSuggestion !== null || actionInFlight !== null || jobIsBusy(state.value);
  const failedJob = state.value.job?.status === "failed" ? state.value.job : undefined;
  const listedSuggestions =
    applyingSuggestion?.listedSuggestions ?? state.value.suggestions;
  const addedCount = contributionIdsInDocument(state.value.document).length;
  const suggestedCount = listedSuggestions.length;
  const status = workflowStatus(
    state,
    suggestedCount,
    addedCount,
    applyingSuggestion !== null,
  );
  const suggestionsByTarget = new Map<
    ApplyingSuggestion["targetBlockId"],
    WorksheetScaffoldingState["suggestions"][number][]
  >();

  for (const suggestion of listedSuggestions) {
    const suggestions = suggestionsByTarget.get(suggestion.targetBlockId);
    if (suggestions === undefined) {
      suggestionsByTarget.set(suggestion.targetBlockId, [suggestion]);
    } else {
      suggestions.push(suggestion);
    }
  }

  const renderSuggestionItem = (
    suggestion: WorksheetScaffoldingState["suggestions"][number],
  ) => {
    return (
      <SuggestionItem key={suggestion.id}>
        <div>
          <OakSecondaryButton
            disabled={isWorking}
            onClick={() => applySuggestion(suggestion.id)}
          >
            {suggestion.label}
          </OakSecondaryButton>
        </div>
      </SuggestionItem>
    );
  };

  const renderWorkingItem = (suggestionId: string) => (
    <SuggestionItem key={suggestionId}>
      <LocalWorking aria-live="polite" ref={applicationStatusRef} tabIndex={-1}>
        <VisibleLoadingSpinner
          aria-hidden="true"
          data-testid="worksheet-scaffolding-local-spinner"
        />
        <OakP $font="body-2">Working on it&hellip;</OakP>
      </LocalWorking>
    </SuggestionItem>
  );

  const renderSuggestionGroup = (
    targetBlockId: ApplyingSuggestion["targetBlockId"],
  ) => {
    const suggestions = suggestionsByTarget.get(targetBlockId) ?? [];

    if (suggestions.length === 0) {
      return null;
    }

    const headingId = `${groupIdPrefix}-${targetBlockId ?? "document"}`;

    return (
      <SuggestionGroup aria-labelledby={headingId} role="group">
        <OakP $font="heading-7" id={headingId}>
          Suggested scaffolds
        </OakP>
        <SuggestionList>
          {suggestions.map((suggestion) =>
            suggestion.id === applyingSuggestion?.id
              ? renderWorkingItem(suggestion.id)
              : renderSuggestionItem(suggestion),
          )}
          <SuggestionItem>
            <OakSecondaryButton
              disabled={isWorking}
              iconName="cross"
              onClick={() => dismissTarget(targetBlockId)}
            >
              No scaffold required
            </OakSecondaryButton>
          </SuggestionItem>
        </SuggestionList>
      </SuggestionGroup>
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
          onRetry={retryReview}
          onUndo={undoReview}
          reason={pendingReview.reason}
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

  return (
    <OakFlex $flexDirection="column" $gap="spacing-16">
      {announcement(status)}
      {status !== null && (
        <StickyWorkflowStatus data-testid="worksheet-scaffolding-status">
          <WorkflowStatusBanner
            cta={
              addedCount === 0 ? undefined : (
                <OakTertiaryButton
                  disabled={isWorking}
                  iconName="trash"
                  onClick={() => startFresh(state.value.adaptationId)}
                >
                  Remove all scaffolds
                </OakTertiaryButton>
              )
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
              <OakSecondaryButton onClick={tryAgain}>Start again</OakSecondaryButton>
            }
            message={failureMessage(failedJob.kind)}
            title={FAILURE_TITLES[failedJob.kind]}
            titleTag="h3"
            type="error"
            variant="regular"
          />
        </StickyWorkflowStatus>
      )}
      {documentIsVisible && (
        <>
          {renderSuggestionGroup(null)}
          <ResourceDocumentRenderer
            decorations={decorations}
            document={state.value.document}
          />
        </>
      )}
    </OakFlex>
  );
}
