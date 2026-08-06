"use client";

import { Component, useEffect, useRef, type ReactNode } from "react";

import type { ResourceAdapterErrorHandler } from "./publicTypes.js";

export type ResourceAdapterErrorBoundaryProps = Readonly<{
  children: ReactNode;
  /** Replaces the default unavailable state. */
  fallback?: (props: { onTryAgain: () => void }) => ReactNode;
  onError?: ResourceAdapterErrorHandler;
  /**
   * Any change clears a caught error. Use primitives: a new object each render
   * always looks changed, which would reset and re-catch in a loop.
   */
  resetKeys?: readonly unknown[];
}>;

type ResourceAdapterErrorBoundaryState = Readonly<{
  hasError: boolean;
}>;

/** React reports whatever was thrown, which is not necessarily an Error. */
function toError(thrown: unknown): Error {
  if (thrown instanceof Error) {
    return thrown;
  }

  try {
    return new Error(String(thrown));
  } catch {
    // String() throws on a null-prototype object, and throwing here would
    // unmount the boundary and let the crash reach the host.
    return new Error("Unstringifiable value thrown during render");
  }
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
 */
export class ResourceAdapterErrorBoundary extends Component<
  ResourceAdapterErrorBoundaryProps,
  ResourceAdapterErrorBoundaryState
> {
  override state: ResourceAdapterErrorBoundaryState = { hasError: false };

  /** The element to hand focus back to once a caught error clears. */
  private focusBeforeError: HTMLElement | null = null;

  static getDerivedStateFromError(): ResourceAdapterErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(
    thrown: unknown,
    errorInfo: { componentStack?: string | null },
  ): void {
    const componentStack = errorInfo.componentStack ?? null;

    try {
      // Promise.resolve so an async onError's rejection is swallowed too.
      void Promise.resolve(
        this.props.onError?.(toError(thrown), { componentStack }),
      ).catch(() => {});
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
      this.state.hasError &&
      resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
      return;
    }

    if (!this.state.hasError) {
      if (prevState.hasError) {
        this.restoreFocus();
      }
      this.rememberFocusTarget();
    }
  }

  // Recorded while healthy: once a crash unmounts a focus trap it is too late,
  // because focus is already on `body`.
  private rememberFocusTarget(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      this.focusBeforeError = active;
    }
  }

  // Only when nothing else holds focus: a recovered dialog focuses its own
  // modal, and that should win.
  private restoreFocus(): void {
    const active = document.activeElement;
    const focusIsAdrift =
      active === null || active === document.body || !active.isConnected;

    if (focusIsAdrift && this.focusBeforeError?.isConnected === true) {
      this.focusBeforeError.focus();
    }
  }

  private readonly reset = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
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
  /** Adds a Dismiss action, for a crash the host has to close around. */
  onDismiss?: () => void;
  /** Take focus on mount, for a crash that unmounted a focus trap. */
  focusOnMount?: boolean;
  message?: string;
  onTryAgain: () => void;
  testId: string;
}>;

// Literal styles, not oak-components: the fallback has to render even when a
// broken oak-components install is the thing that crashed.
const errorRed = "#dd0035";
const bodyBlack = "#222222";

const containerStyle = {
  background: "#ffffff",
  border: `2px solid ${errorRed}`,
  borderRadius: "8px",
  color: bodyBlack,
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "16px",
} as const;

const titleStyle = { color: errorRed, fontWeight: 700, margin: 0 } as const;
const messageStyle = { color: bodyBlack, margin: 0 } as const;
const actionsStyle = { display: "flex", gap: "8px" } as const;

const buttonStyle = {
  background: "#ffffff",
  border: `2px solid ${bodyBlack}`,
  borderRadius: "8px",
  color: bodyBlack,
  cursor: "pointer",
  font: "inherit",
  padding: "8px 16px",
} as const;

/** Shared by both boundaries. No heading, because the host page owns those. */
export function ResourceAdapterUnavailableMessage({
  focusOnMount = false,
  message = "An unexpected problem stopped this feature. The rest of the page still works.",
  onDismiss,
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
      style={containerStyle}
      tabIndex={-1}
    >
      <p style={titleStyle}>Create more with Aila is unavailable</p>
      <p style={messageStyle}>{message}</p>
      <div style={actionsStyle}>
        {/* An explicit type, so recovering inside a host form cannot submit it. */}
        <button onClick={onTryAgain} style={buttonStyle} type="button">
          Try again
        </button>
        {onDismiss && (
          <button onClick={onDismiss} style={buttonStyle} type="button">
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
