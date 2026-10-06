import type {
  SupportLevel,
  WorksheetScaffoldingJobKind,
} from "@oaknational/resource-adapter-contracts/internal";

import type { ResourceAdapterCapabilityId } from "./capabilities.js";
import { reportToHost } from "./errors.js";
import type { ResourceAdapterErrorHandler } from "./publicTypes.js";

/** Replaced at build and test time by the `define` in tsup and Vitest config. */
declare const __RESOURCE_ADAPTER_VERSION__: string;

/**
 * Mirrors the Avo tracking plan. Values are identifiers, enums and counts only;
 * hosts translate property names and add deployment, identity and consent context.
 */
export type CapabilityAnalyticsEvent =
  | Readonly<{
      name: "Adaptation Started";
      componentType: "resource_adapter_dialog";
      adaptationId: string;
      startMode: "new" | "resumed";
    }>
  | Readonly<{
      name: "Adaptation Restart Requested";
      adaptationId: string;
      componentType:
        | "remove_all_scaffolds_button"
        | "start_again_button"
        | "start_from_original_button";
    }>
  | Readonly<{
      name: "Suggestions Displayed";
      componentType: "resource_adapter_dialog";
      adaptationId: string;
      jobId: string;
      suggestionCount: number;
      transformationKinds: readonly string[];
    }>
  | Readonly<{
      name: "New Suggestions Requested";
      adaptationId: string;
      componentType: "generate_new_suggestions_button" | "try_again_button";
    }>
  | Readonly<{
      name: "Suggestion Dismissal Requested";
      adaptationId: string;
      componentType: "no_scaffold_required_button";
      transformationKinds: readonly string[];
    }>
  | Readonly<{
      name: "Transformation Requested";
      adaptationId: string;
      componentType: "suggestion_button";
      transformationKind: string;
      supportLevel?: SupportLevel;
    }>
  | Readonly<{
      name: "Transformation Review Requested";
      adaptationId: string;
      componentType: "accept_button" | "retry_button" | "undo_button";
      reviewAction: "accept" | "retry" | "undo";
      transformationKind: string;
      supportLevel?: SupportLevel;
    }>
  | Readonly<{
      name: "Transformation Reviewed";
      adaptationId: string;
      componentType: "accept_button" | "undo_button";
      reviewAction: "accept" | "undo";
      transformationKind: string;
      supportLevel?: SupportLevel;
    }>
  | Readonly<{
      name: "Transformation Removal Requested";
      adaptationId: string;
      componentType: "remove_scaffold_button";
    }>
  | Readonly<{
      name: "Adaptation Step Failed";
      componentType: "resource_adapter_dialog";
      adaptationId: string;
      jobId: string;
      jobKind: WorksheetScaffoldingJobKind;
    }>
  | Readonly<{
      name: "Adapted Resource Downloaded";
      adaptationId: string;
      componentType: "download_button";
      format: "docx";
    }>
  | Readonly<{
      name: "Transformation Preview Displayed";
      componentType: "resource_adapter_dialog";
      adaptationId: string;
      attemptId: string;
      transformationKind: string;
      supportLevel?: SupportLevel;
    }>
  | Readonly<{
      name: "Adaptation Request Failed";
      componentType: "resource_adapter_dialog";
      adaptationId?: string;
      requestAction:
        | "open"
        | "resume"
        | "apply"
        | "accept"
        | "undo"
        | "dismiss"
        | "remove"
        | "poll"
        | "refresh"
        | "download";
    }>
  | Readonly<{
      name: "Adaptation Request Failed";
      componentType: "resource_adapter_dialog";
      adaptationId?: string;
      requestAction: "retry";
      retryTarget: "suggestions" | "transformation";
    }>
  | Readonly<{
      name: "Resource Adapter Closed";
      componentType: "resource_adapter_dialog";
    }>;

export type ResourceAdapterAnalyticsEvent = CapabilityAnalyticsEvent &
  Readonly<{ capabilityId: ResourceAdapterCapabilityId; packageVersion: string }>;

export type ResourceAdapterAnalyticsHandler = (
  event: ResourceAdapterAnalyticsEvent,
) => void | Promise<void>;

export type TrackAnalyticsEvent = (event: CapabilityAnalyticsEvent) => void;

/** Host failures, including rejected promises, must not interrupt the teacher. */
export function createAnalyticsTracker(
  capabilityId: ResourceAdapterCapabilityId,
  onAnalyticsEvent: ResourceAdapterAnalyticsHandler | undefined,
  onError: ResourceAdapterErrorHandler | undefined,
): TrackAnalyticsEvent {
  return (event) => {
    if (onAnalyticsEvent === undefined) return;
    try {
      void Promise.resolve(
        onAnalyticsEvent({
          ...event,
          capabilityId,
          packageVersion: __RESOURCE_ADAPTER_VERSION__,
        }),
      ).catch((error: unknown) => reportToHost(onError, error));
    } catch (error) {
      reportToHost(onError, error);
    }
  };
}
