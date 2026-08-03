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
  onError?: ResourceAdapterErrorHandler;
  /** When absent, caught errors are not reported to the Resource Adapter API. */
  reporting?: ResourceAdapterReportingProps;
  /**
   * Any change clears a caught error. Use primitives: a new object each render
   * always looks changed, which would reset and re-catch in a loop.
   */
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
 * Catches render failures in the adapter so they cannot take down the host
 * lesson page. A class because React offers no function equivalent.
 *
 * Only render failures. Failed requests, event-handler errors and async
 * rejections keep their own error states.
 */
export class ResourceAdapterErrorBoundary extends Component<
  ResourceAdapterErrorBoundaryProps,
  ResourceAdapterErrorBoundaryState
> {
  override state: ResourceAdapterErrorBoundaryState = { error: null };

  /** Dev StrictMode can surface one throw twice; report it once. */
  private lastCaught: unknown = null;

  /** The element to hand focus back to once a caught error clears. */
  private focusBeforeError: HTMLElement | null = null;

  static getDerivedStateFromError(thrown: unknown): ResourceAdapterErrorBoundaryState {
    return { error: toError(thrown) };
  }

  override componentDidCatch(
    thrown: unknown,
    errorInfo: { componentStack?: string | null },
  ): void {
    if (thrown === this.lastCaught) {
      return;
    }
    this.lastCaught = thrown;

    const error = toError(thrown);
    const componentStack = errorInfo.componentStack ?? null;

    // The two reporting paths are independent, so a throwing host callback
    // cannot stop the API report. reportClientError never rejects.
    if (this.props.reporting) {
      void reportClientError({
        componentStack,
        error,
        reporting: this.props.reporting,
      });
    }

    try {
      // Promise.resolve so an async onError's rejection is swallowed too.
      void Promise.resolve(this.props.onError?.(error, { componentStack })).catch(
        () => {},
      );
    } catch {
      // A broken host callback must not affect the fallback render.
    }
  }

  override componentDidMount(): void {
    this.rememberFocusTarget();
  }

  override componentDidUpdate(
    prevProps: ResourceAdapterErrorBoundaryProps,
    prevState: ResourceAdapterErrorBoundaryState,
  ): void {
    if (
      this.state.error !== null &&
      resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
      return;
    }

    if (this.state.error === null) {
      if (prevState.error !== null) {
        this.restoreFocus();
      }
      this.rememberFocusTarget();
    }
  }

  /**
   * Records where focus sits while the tree is healthy. Recording it later is
   * too late: once a crash unmounts a focus trap, focus is already on `body`.
   */
  private rememberFocusTarget(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      this.focusBeforeError = active;
    }
  }

  /**
   * Hands focus back once the fallback has gone, but only if nothing else holds
   * it. A recovered dialog focuses its own modal, and that should win.
   */
  private restoreFocus(): void {
    const active = document.activeElement;
    const focusIsAdrift =
      active === null || active === document.body || !active.isConnected;

    if (focusIsAdrift && this.focusBeforeError?.isConnected === true) {
      this.focusBeforeError.focus();
    }
  }

  private readonly reset = (): void => {
    // Cleared so a real second crash of the same error reports again.
    this.lastCaught = null;
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
      <ResourceAdapterUnavailableMessage
        onTryAgain={this.reset}
        testId="resource-adapter-error-fallback"
      />
    );
  }
}

type ResourceAdapterUnavailableMessageProps = Readonly<{
  /** Rendered beside Try again, e.g. the dialog's Dismiss control. */
  extraAction?: ReactNode;
  /**
   * Take keyboard focus on mount. Needed when the crash unmounted a focus trap,
   * unwanted inside intact UI where `role="alert"` announces it anyway.
   */
  focusOnMount?: boolean;
  message?: string;
  onTryAgain: () => void;
  testId: string;
}>;

/**
 * The unavailable state shared by every boundary in the package.
 *
 * Built from primitives, not `OakInlineBanner`, because that renders its title
 * as an `h1` and the host page owns the `h1`. No heading here, and no icon:
 * oak-components loads icons from Cloudinary, which hosts may not have set up.
 */
export function ResourceAdapterUnavailableMessage({
  extraAction,
  focusOnMount = false,
  message = "An unexpected problem stopped this feature. The rest of the page still works.",
  onTryAgain,
  testId,
}: ResourceAdapterUnavailableMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusOnMount) {
      containerRef.current?.focus();
    }
  }, [focusOnMount]);

  return (
    <div
      aria-atomic="true"
      data-testid={testId}
      ref={containerRef}
      role="alert"
      tabIndex={-1}
    >
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
        <OakFlex $gap="spacing-8">
          {/*
            An explicit type, because oak-components renders a bare `button`
            with none: inside a host `form` the default would be submit, so
            recovering from a crash would post the teacher's form.
          */}
          <OakSecondaryButton onClick={onTryAgain} type="button">
            Try again
          </OakSecondaryButton>
          {extraAction}
        </OakFlex>
      </OakFlex>
    </div>
  );
}
