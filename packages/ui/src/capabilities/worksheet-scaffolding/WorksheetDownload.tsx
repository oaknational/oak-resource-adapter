"use client";

import { Fragment, useState } from "react";
import {
  OakButtonWithDropdown,
  OakFlex,
  OakIcon,
  OakP,
  OakSecondaryButton,
  OakSpan,
} from "@oaknational/oak-components";
import {
  worksheetExportFormats,
  type WorksheetDownloadAvailability,
  type WorksheetExportFormat,
  type WorksheetExportVariant,
} from "@oaknational/resource-adapter-contracts/internal";

import { AiMenuButton, AiMenuSection, LearnMoreSection } from "../../AiMenu.js";
import type { TrackAnalyticsEvent } from "../../analytics.js";
import { ResourceAdapterApiError } from "../../errors.js";
import type { GetToken, ResourceAdapterErrorHandler } from "../../publicTypes.js";
import {
  useResourceDownload,
  type ResourceDownloadState,
} from "../../useResourceDownload.js";
import { prepareWorksheetExport } from "../../worksheetScaffolding.js";

const lockedReasons: Record<
  Exclude<WorksheetDownloadAvailability, "available">,
  string
> = {
  original: "Accept scaffolds to access downloads",
  review: "Accept or undo the scaffold under review to access downloads",
  busy: "Wait for the worksheet to finish updating to access downloads",
  unavailable: "This worksheet isn't available to download",
};

const sections = [
  {
    variant: "scaffolded",
    heading: "Scaffolded worksheet",
    filename: "Scaffolded_worksheet",
  },
  {
    variant: "original",
    heading: "Original worksheet",
    filename: "Original_worksheet",
  },
] as const satisfies readonly Readonly<{
  variant: WorksheetExportVariant;
  heading: string;
  filename: string;
}>[];

type DownloadTarget = Readonly<{
  key: string;
  format: WorksheetExportFormat;
  variant: WorksheetExportVariant;
}>;

function downloadTarget(
  variant: WorksheetExportVariant,
  format: WorksheetExportFormat,
): DownloadTarget {
  return { key: `${variant}.${format}`, format, variant };
}

function downloadMessage(
  state: ResourceDownloadState,
  variant: WorksheetExportVariant,
): string {
  switch (state.phase) {
    case "idle":
      return "";
    case "preparing":
      return variant === "original"
        ? "Preparing an editable Word document of the original worksheet."
        : "Preparing an editable Word document with your accepted changes.";
    case "downloading":
      return "Getting your Word document. Your changes are saved here.";
    case "refreshing":
      return "The worksheet has changed. Refreshing it before you download again.";
    case "done":
      return "Download generated";
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

function refreshedMessage(availability: WorksheetDownloadAvailability): string {
  return availability === "available"
    ? "Worksheet refreshed. You can try downloading again."
    : `Worksheet refreshed. ${lockedReasons[availability]}.`;
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
  track,
}: Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  adaptationId: string;
  resourceDocumentId: string;
  availability: WorksheetDownloadAvailability;
  onRefresh: () => Promise<void>;
  worksheetWasRefreshed?: boolean;
  onError?: ResourceAdapterErrorHandler | undefined;
  track: TrackAnalyticsEvent;
}>) {
  const [lastTarget, setLastTarget] = useState<DownloadTarget | null>(null);
  const { state, download, tooLargeKeys } = useResourceDownload<DownloadTarget>({
    apiBaseUrl,
    getToken,
    resourceDocumentId,
    enabled: availability === "available",
    prepare: (target, signal) =>
      prepareWorksheetExport({
        apiBaseUrl,
        getToken,
        resourceDocumentId,
        adaptationId,
        format: target.format,
        variant: target.variant,
        signal,
      }),
    onStale: onRefresh,
    onDownloaded: (target) =>
      track({
        name:
          target.variant === "original"
            ? "Original Resource Downloaded"
            : "Adapted Resource Downloaded",
        adaptationId,
        componentType: "download_menu_item",
        format: target.format,
      }),
    onFailed: () =>
      track({
        name: "Adaptation Request Failed",
        componentType: "resource_adapter_dialog",
        adaptationId,
        requestAction: "download",
      }),
    onError,
  });
  const { phase } = state;
  const active =
    phase === "preparing" || phase === "downloading" || phase === "refreshing";
  const failed = phase === "error" || phase === "tooLarge";
  const message = downloadMessage(state, lastTarget?.variant ?? "scaffolded");
  const feedback =
    message || (worksheetWasRefreshed ? refreshedMessage(availability) : "");
  const select = (target: DownloadTarget) => {
    setLastTarget(target);
    void download(target);
  };

  return (
    <OakFlex
      $alignItems={["flex-start", "center"]}
      $flexDirection={["column", "row"]}
      $gap="spacing-16"
    >
      <OakButtonWithDropdown
        buttonComponent={OakSecondaryButton}
        dropdownProps={{ "aria-label": "Download worksheet", role: "menu" }}
        primaryActionText="Download worksheet"
      >
        {availability === "available" ? (
          sections.map(({ variant, heading, filename }, index) => (
            <Fragment key={variant}>
              {index > 0 && <OakButtonWithDropdown.Divider />}
              <AiMenuSection heading={heading}>
                {worksheetExportFormats.map((format) => {
                  const target = downloadTarget(variant, format);
                  return (
                    <AiMenuButton
                      disabled={active || tooLargeKeys.has(target.key)}
                      iconName="download"
                      key={format}
                      onSelect={() => select(target)}
                    >
                      {`${filename}.${format}`}
                    </AiMenuButton>
                  );
                })}
              </AiMenuSection>
            </Fragment>
          ))
        ) : (
          // Focusable but inert, so arrow keys reach it and screen readers announce it.
          <OakSpan
            $color="text-error"
            $font="body-2"
            $ph="spacing-8"
            $pv="spacing-8"
            aria-disabled="true"
            role="menuitem"
            tabIndex={0}
          >
            {lockedReasons[availability]}
          </OakSpan>
        )}
        <LearnMoreSection onSelect={() => {}} />
      </OakButtonWithDropdown>
      <OakFlex
        $alignItems="center"
        $gap="spacing-8"
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
            $minWidth="spacing-24"
            $height="spacing-24"
            aria-hidden="true"
          />
        )}
        <OakP $font="body-2" $color="text-primary">
          {feedback}
        </OakP>
      </OakFlex>
    </OakFlex>
  );
}
