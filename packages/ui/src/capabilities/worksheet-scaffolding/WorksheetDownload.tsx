"use client";

import { useId } from "react";
import { OakIcon, OakP, OakPrimaryButton } from "@oaknational/oak-components";
import { keyframes, styled } from "styled-components";
import type { WorksheetDownloadAvailability } from "@oaknational/resource-adapter-contracts/internal";

import { ResourceAdapterApiError } from "../../errors.js";
import type { GetToken, ResourceAdapterErrorHandler } from "../../publicTypes.js";
import {
  useResourceDownload,
  type ResourceDownloadState,
} from "../../useResourceDownload.js";
import { prepareWorksheetExport } from "../../worksheetScaffolding.js";

const explanations: Record<WorksheetDownloadAvailability, string> = {
  available: "Editable Word document (.docx)",
  original: "Apply and accept a scaffold before downloading your adapted worksheet.",
  review: "Accept or undo the scaffold under review before downloading.",
  busy: "Wait for the worksheet to finish updating before downloading.",
  unavailable: "This worksheet is not available to download.",
};

const DownloadRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
`;

const DownloadButton = styled(OakPrimaryButton)`
  min-inline-size: min(15rem, 100%);
  max-inline-size: 100%;

  button {
    scroll-margin-block: 7rem;
  }
`;

const DownloadFeedback = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1 1 16rem;
  min-inline-size: 0;

  img {
    flex-shrink: 0;
  }
`;

const rotate = keyframes`
  to { transform: rotate(360deg); }
`;

const DownloadSpinner = styled.span`
  display: block;
  flex-shrink: 0;
  inline-size: 1.25rem;
  block-size: 1.25rem;
  box-sizing: border-box;
  border: 0.1875rem solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: ${rotate} 1.2s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const buttonLabels = {
  idle: "Download worksheet",
  preparing: "Preparing worksheet…",
  downloading: "Downloading…",
  refreshing: "Refreshing worksheet…",
  done: "Download again",
  error: "Retry download",
  tooLarge: "Download unavailable",
} as const;

function downloadMessage(state: ResourceDownloadState): string {
  switch (state.phase) {
    case "idle":
      return "";
    case "preparing":
      return "Preparing an editable Word document with your accepted changes.";
    case "downloading":
      return "Getting your Word document. Your changes are saved here.";
    case "refreshing":
      return "The worksheet has changed. Refreshing it before you download again.";
    case "done":
      return "Your worksheet is ready.";
    case "tooLarge":
      return "This worksheet is too large to download as a Word document. Your changes are saved here.";
    case "error": {
      if (state.stage === "refresh")
        return "We couldn’t refresh the worksheet. Your changes are saved here. Try again.";
      if (state.error instanceof ResourceAdapterApiError && state.error.status === 401)
        return "Sign in again, then retry your download. Your changes are saved here.";
      if (state.stage === "delivery")
        return "We couldn’t download your Word document. Your changes are saved here. Try again.";
      return "We couldn’t prepare your Word document. Your changes are saved here. Try again.";
    }
  }
}

export function WorksheetDownload({
  apiBaseUrl,
  getToken,
  adaptationId,
  resourceDocumentId,
  availability,
  onRefresh,
  worksheetWasRefreshed = false,
  onError,
}: Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  adaptationId: string;
  resourceDocumentId: string;
  availability: WorksheetDownloadAvailability;
  onRefresh: () => Promise<void>;
  worksheetWasRefreshed?: boolean;
  onError?: ResourceAdapterErrorHandler | undefined;
}>) {
  const descriptionId = useId();
  const { state, download } = useResourceDownload({
    apiBaseUrl,
    getToken,
    resourceDocumentId,
    format: "docx",
    enabled: availability === "available",
    prepare: (signal) =>
      prepareWorksheetExport({
        apiBaseUrl,
        getToken,
        resourceDocumentId,
        adaptationId,
        format: "docx",
        signal,
      }),
    onStale: onRefresh,
    onError,
  });
  const { phase } = state;
  const message = downloadMessage(state);
  const active =
    phase === "preparing" || phase === "downloading" || phase === "refreshing";
  const failed = phase === "error" || phase === "tooLarge";
  const idleFeedback = worksheetWasRefreshed
    ? availability === "available"
      ? "Worksheet refreshed. You can try downloading again."
      : `Worksheet refreshed. ${explanations[availability]}`
    : explanations[availability];
  const feedback = message || idleFeedback;
  return (
    <DownloadRow>
      <DownloadButton
        aria-describedby={descriptionId}
        aria-busy={active}
        disabled={availability !== "available" || active || phase === "tooLarge"}
        iconName="download"
        iconAriaHidden
        iconOverride={active ? <DownloadSpinner aria-hidden="true" /> : undefined}
        onClick={() => void download()}
      >
        {buttonLabels[phase]}
      </DownloadButton>
      <DownloadFeedback
        id={descriptionId}
        aria-label="Download status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {(phase === "done" || failed) && (
          <OakIcon
            iconName={phase === "done" ? "tick" : "warning"}
            $colorFilter={phase === "done" ? "icon-success" : "icon-error"}
            $width="spacing-24"
            $height="spacing-24"
            aria-hidden="true"
          />
        )}
        <div>
          <OakP $font="body-2" $color="text-primary">
            {phase === "done" ? <strong>{feedback}</strong> : feedback}
          </OakP>
          {phase === "done" && (
            <OakP $font="body-3">
              Find the Word document in your browser’s downloads.
            </OakP>
          )}
        </div>
      </DownloadFeedback>
    </DownloadRow>
  );
}
