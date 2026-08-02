"use client";

import { Component, useEffect, useRef, type ReactNode } from "react";
import { OakFlex, OakP, OakSecondaryButton } from "@oaknational/oak-components";

import { reportClientError } from "./reportClientError.js";
import type {
  ResourceAdapterErrorHandler,
  ResourceAdapterReportingProps,
} from "./publicTypes.js";

export type ResourceAdapterErrorBoundaryProps = Readonly<{
  children: ReactNode;
  /** Replaces the default Oak-styled unavailable state. */
  fallback?: (props: { onTryAgain: () => void }) => ReactNode;
  /**
   * Move keyboard focus to the default fallback when it appears. Needed when
   * the crash unmounts a focus trap (e.g. the dialog), which drops focus on
   * `body`; unnecessary when the fallback renders inside intact UI, where
   * `role="alert"` already announces it.
   */
  moveFocusToFallback?: boolean;
  onError?: ResourceAdapterErrorHandler;
  /** When absent, caught errors are not reported to the Resource Adapter API. */
  reporting?: ResourceAdapterReportingProps;
  /** Shallow-compared each render; any change clears a caught error. */
  resetKeys?: readonly unknown[];
}>;

type ResourceAdapterErrorBoundaryState = Readonly<{
  error: Error | null;
}>;

/** React reports whatever was thrown, which is not necessarily an Error. */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

function resetKeysChanged(
  previous: readonly unknown[] = [],
  next: readonly unknown[] = [],
): boolean {
  return (
    previous.length !== next.length ||
    previous.some((value, index) => !Object.is(value, next[index]))
  );
}

/**
 * Catches render failures in the Resource Adapter surface so they cannot take
 * down the host lesson page. A class because React provides no function
 * equivalent of `getDerivedStateFromError`/`componentDidCatch`.
 *
 * Boundaries only catch errors thrown during render: failed requests,
 * event-handler errors, and async rejections keep their explicit error states.
 */
export class ResourceAdapterErrorBoundary extends Component<
  ResourceAdapterErrorBoundaryProps,
  ResourceAdapterErrorBoundaryState
> {
  override state: ResourceAdapterErrorBoundaryState = { error: null };

  /** Dev StrictMode can surface one throw twice; report it once. */
  private lastCaught: unknown = null;

  static getDerivedStateFromError(thrown: unknown): ResourceAdapterErrorBoundaryState {
    return { error: toError(thrown) };
  }

  override componentDidCatch(
    thrown: Error,
    errorInfo: { componentStack?: string | null },
  ): void {
    if (thrown === this.lastCaught) {
      return;
    }
    this.lastCaught = thrown;

    const error = toError(thrown);
    const componentStack = errorInfo.componentStack ?? null;

    // The two reporting paths are deliberately independent: a throwing host
    // callback must not stop the API report, and vice versa.
    if (this.props.reporting) {
      try {
        void reportClientError({
          componentStack,
          error,
          reporting: this.props.reporting,
        });
      } catch {
        // reportClientError never throws; belt and braces.
      }
    }

    try {
      this.props.onError?.(error, { componentStack });
    } catch {
      // A broken host callback must not affect the fallback render.
    }
  }

  override componentDidUpdate(prevProps: ResourceAdapterErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback({ onTryAgain: this.reset });
    }

    return (
      <ResourceAdapterErrorFallback
        moveFocus={this.props.moveFocusToFallback ?? false}
        onTryAgain={this.reset}
      />
    );
  }
}

type ResourceAdapterErrorFallbackProps = Readonly<{
  moveFocus: boolean;
  onTryAgain: () => void;
}>;

/**
 * The default unavailable state. Composed from primitives rather than
 * `OakInlineBanner`, which renders its title as an `h1`: the host page owns
 * the `h1`, and a second one would break its heading structure. This is a
 * status message, so it carries no heading at all and is announced by
 * `role="alert"` with `aria-atomic`.
 *
 * No icon, deliberately: oak-components resolves icons through Cloudinary, so
 * an icon here would render broken in any host that has not configured it.
 */
function ResourceAdapterErrorFallback({
  moveFocus,
  onTryAgain,
}: ResourceAdapterErrorFallbackProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (moveFocus) {
      containerRef.current?.focus();
    }
  }, [moveFocus]);

  return (
    <div
      aria-atomic="true"
      data-testid="resource-adapter-error-fallback"
      ref={containerRef}
      role="alert"
      tabIndex={-1}
    >
      <ResourceAdapterUnavailableMessage onTryAgain={onTryAgain} />
    </div>
  );
}

type ResourceAdapterUnavailableMessageProps = Readonly<{
  message?: string;
  onTryAgain: () => void;
}>;

/** The shared visual treatment for both unavailable states. */
export function ResourceAdapterUnavailableMessage({
  message = "An unexpected problem stopped this feature. The rest of the page still works.",
  onTryAgain,
}: ResourceAdapterUnavailableMessageProps) {
  return (
    <OakFlex
      $ba="border-solid-m"
      $borderColor="border-error"
      $borderRadius="border-radius-m"
      $flexDirection="column"
      $gap="spacing-8"
      $pa="spacing-16"
    >
      <OakP $color="text-error" $font="body-2-bold">
        Create more with Aila is unavailable
      </OakP>
      <OakP $font="body-3">{message}</OakP>
      <OakFlex>
        <OakSecondaryButton onClick={onTryAgain}>Try again</OakSecondaryButton>
      </OakFlex>
    </OakFlex>
  );
}
