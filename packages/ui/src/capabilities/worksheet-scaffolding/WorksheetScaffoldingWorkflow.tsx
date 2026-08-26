"use client";

import { useId } from "react";
import {
  OakFlex,
  OakHeading,
  OakInlineBanner,
  OakP,
  OakPrimaryButton,
  OakSecondaryButton,
  parseColor,
} from "@oaknational/oak-components";
import type {
  WorksheetScaffoldingResumable,
  WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceNode } from "@oaknational/resource-document";
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
  title: string;
  tone: "neutral" | "success" | "working";
}>;

const LOADING_STATUS: WorkflowStatus = {
  message: "Getting your worksheet ready.",
  title: "Loading worksheet",
  tone: "working",
};

const Suggestion = styled.div`
  background: ${parseColor("bg-neutral")};
  border: 1px solid ${parseColor("border-neutral")};
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.5rem 0 1rem;
  padding: 0.75rem;

  /* Keeps a focused button clear of the sticky status banner above it. */
  button {
    scroll-margin-top: 7rem;
  }
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

function LoadingStatusBanner({ message, title }: Omit<WorkflowStatus, "tone">) {
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

function workflowStatus(
  state: WorkflowState,
  isApplying: boolean,
): WorkflowStatus | null {
  if (state.status === "loading") {
    return LOADING_STATUS;
  }
  if (state.status === "choosing") {
    return null;
  }
  if (state.status !== "ready") {
    return null;
  }
  return readyStatus(state.value, isApplying);
}

function readyStatus(
  state: WorksheetScaffoldingState,
  isApplying: boolean,
): WorkflowStatus | null {
  if (isApplying) {
    return {
      message: "Updating the worksheet with your chosen scaffold.",
      title: "Applying scaffold",
      tone: "working",
    };
  }
  if (jobIsBusy(state)) {
    return {
      message: "Reviewing the worksheet for useful scaffolds.",
      title: "Finding useful scaffolds",
      tone: "working",
    };
  }
  if (state.job?.status === "failed") {
    return null;
  }
  if (state.suggestions.length > 0) {
    return {
      message:
        "You can now review suggestions throughout the worksheet. Choose any that suit your class.",
      title: "Scaffolds ready",
      tone: "success",
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
        You added {scaffoldSummary(resumable.scaffoldCount)} to this worksheet on{" "}
        {lastWorkedOn}. You can keep going, or start again from Oak&rsquo;s original.
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
    applySuggestion,
    applyingSuggestionId,
    resume,
    startFresh,
    state,
    statusRef,
    tryAgain,
  } = useWorksheetScaffolding(props);
  const reasonIdPrefix = useId();

  if (state.status === "idle") {
    return null;
  }

  const status = workflowStatus(state, applyingSuggestionId !== null);

  // One region for the whole workflow: a region mounted alongside its own text
  // is announced unreliably, whereas changing the text of a mounted region is not.
  const announcement = (
    <StatusAnnouncement aria-atomic="true" aria-live="polite" role="status">
      {status === null ? "" : `${status.title}. ${status.message}`}
    </StatusAnnouncement>
  );

  if (state.status === "loading") {
    return (
      <>
        {announcement}
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
        {announcement}
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
        {announcement}
        <ResourceAdapterUnavailableMessage
          message="Worksheet scaffolding could not be loaded."
          onTryAgain={tryAgain}
          testId="resource-adapter-worksheet-scaffolding-error"
        />
      </>
    );
  }

  const isWorking = applyingSuggestionId !== null || jobIsBusy(state.value);
  const failedJob = state.value.job?.status === "failed" ? state.value.job : undefined;

  const renderSuggestion = (
    suggestion: WorksheetScaffoldingState["suggestions"][number],
  ) => {
    const reasonId = `${reasonIdPrefix}-${suggestion.id}`;
    return (
      <Suggestion key={suggestion.id}>
        <OakP id={reasonId}>{suggestion.reason}</OakP>
        <div>
          <OakSecondaryButton
            aria-describedby={reasonId}
            disabled={isWorking}
            onClick={() => applySuggestion(suggestion.id)}
          >
            {suggestion.label}
          </OakSecondaryButton>
        </div>
      </Suggestion>
    );
  };
  const renderAfterNode = (node: ResourceNode) =>
    state.value.suggestions
      .filter(({ targetBlockId }) => targetBlockId === node.id)
      .map(renderSuggestion);
  const documentSuggestions = state.value.suggestions.filter(
    ({ targetBlockId }) => targetBlockId === null,
  );

  return (
    <OakFlex $flexDirection="column" $gap="spacing-16">
      {announcement}
      <OakP>Review the worksheet and choose any scaffolds that suit your class.</OakP>
      {status !== null && (
        <StickyWorkflowStatus ref={statusRef} tabIndex={-1}>
          {status.tone === "working" ? (
            <LoadingStatusBanner message={status.message} title={status.title} />
          ) : (
            <OakInlineBanner
              isOpen
              message={status.message}
              title={status.title}
              titleTag="h3"
              type={status.tone}
              variant="regular"
            />
          )}
        </StickyWorkflowStatus>
      )}
      {failedJob !== undefined && (
        <StickyWorkflowStatus aria-atomic="true" role="alert">
          <OakInlineBanner
            isOpen
            cta={
              <OakSecondaryButton onClick={tryAgain}>Start again</OakSecondaryButton>
            }
            message="Start again to reopen the original worksheet."
            title={
              failedJob.kind === "suggestions.apply"
                ? "We couldn't apply that scaffold"
                : "We couldn't find scaffolds"
            }
            titleTag="h3"
            type="error"
            variant="regular"
          />
        </StickyWorkflowStatus>
      )}
      {documentSuggestions.map(renderSuggestion)}
      <ResourceDocumentRenderer
        document={state.value.document}
        renderAfterNode={renderAfterNode}
      />
    </OakFlex>
  );
}
