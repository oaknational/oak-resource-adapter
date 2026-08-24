"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OakFlex, OakLoadingSpinner, OakP } from "@oaknational/oak-components";
import type { ResourceDocument } from "@oaknational/resource-document";

import { getResourceAdapterSourceDocument } from "../../getResourceAdapterSourceDocument.js";
import { reportToHost } from "../../errors.js";
import { ResourceAdapterUnavailableMessage } from "../../ResourceAdapterErrorBoundary.js";
import { ResourceDocumentRenderer } from "../../resource-document/ResourceDocumentRenderer.js";
import type {
  GetToken,
  LessonContext,
  ResourceAdapterErrorHandler,
} from "../../publicTypes.js";

export type WorksheetAdapterWorkflowProps = Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onError?: ResourceAdapterErrorHandler;
}>;

type SourceDocumentState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; document: ResourceDocument }>
  | Readonly<{ status: "error" }>;

function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

export function WorksheetAdapterWorkflow({
  apiBaseUrl,
  getToken,
  isOpen,
  lesson,
  onError,
}: WorksheetAdapterWorkflowProps) {
  const [state, setState] = useState<SourceDocumentState>({ status: "idle" });
  const [retryCount, setRetryCount] = useState(0);
  const getTokenRef = useLatestRef(getToken);
  const lessonRef = useLatestRef(lesson);
  const onErrorRef = useLatestRef(onError);
  // A host is free to rebuild `lesson` and `getToken` on every render, so the
  // fetch keys on the lesson's contents rather than the object's identity.
  const lessonKey = JSON.stringify(lesson);

  useEffect(() => {
    let canceled = false;

    if (!isOpen) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });

    void getResourceAdapterSourceDocument({
      apiBaseUrl,
      capabilityId: "worksheetAdapter",
      getToken: () => getTokenRef.current(),
      lesson: lessonRef.current,
    })
      .then((document) => {
        if (!canceled) {
          setState({ status: "ready", document });
        }
      })
      .catch((error: unknown) => {
        reportToHost(onErrorRef.current, error);
        if (!canceled) {
          setState({ status: "error" });
        }
      });

    return () => {
      canceled = true;
    };
  }, [apiBaseUrl, getTokenRef, isOpen, lessonKey, lessonRef, onErrorRef, retryCount]);

  const tryAgain = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  if (state.status === "idle") {
    return null;
  }

  if (state.status === "loading") {
    return (
      <OakFlex $alignItems="center" $gap="spacing-8" aria-live="polite" role="status">
        {/* Hidden from the status announcement: the spinner ships its own
            "Loading" label, which would double up with the text beside it. */}
        <span aria-hidden="true">
          <OakLoadingSpinner $delay={300} $width="spacing-24" />
        </span>
        <OakP>Loading worksheet…</OakP>
      </OakFlex>
    );
  }

  if (state.status === "error") {
    return (
      <ResourceAdapterUnavailableMessage
        message="The source worksheet could not be loaded."
        onTryAgain={tryAgain}
        testId="resource-adapter-source-document-error"
      />
    );
  }

  return (
    <OakFlex $flexDirection="column" $gap="spacing-16">
      <OakP>Review the original worksheet before choosing how to scaffold it.</OakP>
      <ResourceDocumentRenderer document={state.document} />
    </OakFlex>
  );
}
