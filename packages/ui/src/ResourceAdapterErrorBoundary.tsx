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
   * Shallow-compared each render; any change clears a caught error. Pass
   * primitives: a value rebuilt each render (an object or array literal) looks
   * changed every time, so a persistent crash would reset and re-catch in a loop.
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

    // The two reporting paths are deliberately independent: a throwing host
    // callback must not stop the API report, and vice versa. reportClientError
    // never rejects, so the fire-and-forget call needs no guard of its own.
    if (this.props.reporting) {
      void reportClientError({
        componentStack,
        error,
        reporting: this.props.reporting,
      });
    }

    try {
      this.props.onError?.(error, { componentStack });
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
   * Records where focus sits while the tree is healthy, so it can be handed
   * back after a crash. Only a commit is early enough: by the time a fallback
   * mounts, a crash that unmounted a focus trap has already left focus on
   * `body`. The dialog's opening commit still has the host's trigger focused,
   * which is the element a teacher expects to return to.
   */
  private rememberFocusTarget(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      this.focusBeforeError = active;
    }
  }

  /**
   * Hands focus back once the fallback has gone, but only when nothing else
   * holds it: recovering the dialog remounts a modal that focuses its own trap,
   * and that deliberate placement must win over this one.
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
    // Clearing this lets a genuine second crash of the same error object after
    // a reset report again, while still collapsing one crash seen twice.
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
   * Take keyboard focus on mount. Needed when the crash unmounted a focus trap
   * (the dialog), which drops focus on `body`; unwanted when the message
   * appears inside intact UI, where `role="alert"` announces it without
   * stealing focus.
   */
  focusOnMount?: boolean;
  message?: string;
  onTryAgain: () => void;
  testId: string;
}>;

/**
 * The unavailable state shared by every boundary in the package.
 *
 * Composed from primitives rather than `OakInlineBanner`, which renders its
 * title as an `h1`: the host page owns the `h1`, and a second one would break
 * its heading structure. This is a status message, so it carries no heading at
 * all and is announced by `role="alert"` with `aria-atomic`.
 *
 * No icon, deliberately: oak-components resolves icons through Cloudinary, so
 * an icon here would render broken in any host that has not configured it.
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
