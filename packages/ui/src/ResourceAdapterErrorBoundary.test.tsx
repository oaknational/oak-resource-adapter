// @vitest-environment jsdom
import { StrictMode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceAdapterErrorBoundary } from "./ResourceAdapterErrorBoundary.js";

// No OakThemeProvider anywhere in this file: the fallback must render without
// oak-components, since a broken install is a reason the boundary catches.

function Bomb({ message = "Deterministic test crash" }: { message?: string }): never {
  throw new Error(message);
}

function ThrowsString(): never {
  throw "a string, not an Error";
}

/** Throws a null-prototype object, which `String()` cannot convert. */
function ThrowsUnstringifiable(): never {
  throw Object.create(null);
}

function ThrowsNull(): never {
  throw null;
}

// jsdom does not fire `unhandledrejection`, so the rejection has to be observed
// on the node process. Declared locally because this package keeps node types
// out of scope for its browser-facing source.
declare const process: {
  on(event: "unhandledRejection", listener: () => void): void;
  off(event: "unhandledRejection", listener: () => void): void;
};

/** Throws until `crash.active` is cleared. */
const crash = { active: true };

function MaybeBomb() {
  if (crash.active) {
    throw new Error("transient crash");
  }
  return <p>recovered content</p>;
}

describe("ResourceAdapterErrorBoundary", () => {
  beforeEach(() => {
    // React logs every caught error; keep the output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders its children when nothing throws", () => {
    render(
      <ResourceAdapterErrorBoundary>
        <p>healthy content</p>
      </ResourceAdapterErrorBoundary>,
    );

    expect(screen.getByText("healthy content")).toBeVisible();
    expect(
      screen.queryByTestId("resource-adapter-error-fallback"),
    ).not.toBeInTheDocument();
  });

  it("catches a child crash and shows the fallback while siblings survive", () => {
    render(
      <>
        <p>host page content</p>
        <ResourceAdapterErrorBoundary>
          <Bomb />
        </ResourceAdapterErrorBoundary>
      </>,
    );

    expect(screen.getByText("host page content")).toBeVisible();
    const fallback = screen.getByTestId("resource-adapter-error-fallback");
    expect(fallback).toHaveAttribute("role", "alert");
    expect(fallback).toHaveAttribute("aria-atomic", "true");
    expect(screen.getByText("Create more with Aila is unavailable")).toBeVisible();
  });

  it("invokes the host onError once with the error and component stack", () => {
    const onError = vi.fn();

    render(
      <ResourceAdapterErrorBoundary onError={onError}>
        <Bomb message="dialog exploded" />
      </ResourceAdapterErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "dialog exploded" }),
      expect.objectContaining({ componentStack: expect.stringContaining("Bomb") }),
    );
  });

  it("still renders the fallback when onError throws", () => {
    render(
      <ResourceAdapterErrorBoundary
        onError={() => {
          throw new Error("broken host callback");
        }}
      >
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();
  });

  it("swallows a rejection from an async onError", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      render(
        <ResourceAdapterErrorBoundary
          onError={async () => {
            throw new Error("broken async host callback");
          }}
        >
          <Bomb />
        </ResourceAdapterErrorBoundary>,
      );

      // Rejections surface a tick later, so let the microtask queue drain.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).not.toHaveBeenCalled();
      expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  // React invokes componentDidCatch once per crash, StrictMode included, so
  // the boundary needs no dedupe of its own. This fails if that ever changes.
  it("reports one crash exactly once under StrictMode", () => {
    const onError = vi.fn();

    render(
      <StrictMode>
        <ResourceAdapterErrorBoundary onError={onError}>
          <Bomb />
        </ResourceAdapterErrorBoundary>
      </StrictMode>,
    );

    expect(onError).toHaveBeenCalledOnce();
  });

  it("coerces a non-Error throw into an Error before handing it to the host", () => {
    const onError = vi.fn();

    render(
      <ResourceAdapterErrorBoundary onError={onError}>
        <ThrowsString />
      </ResourceAdapterErrorBoundary>,
    );

    const [caught] = onError.mock.calls[0] ?? [];
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("a string, not an Error");
  });

  it("contains a throw that cannot be converted to a string", () => {
    const onError = vi.fn();

    render(
      <>
        <p>host page content</p>
        <ResourceAdapterErrorBoundary onError={onError}>
          <ThrowsUnstringifiable />
        </ResourceAdapterErrorBoundary>
      </>,
    );

    // Coercing this throw is what would break the boundary itself, letting the
    // crash escape to the host.
    expect(screen.getByText("host page content")).toBeVisible();
    expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("tells the host about a null throw", () => {
    const onError = vi.fn();

    render(
      <ResourceAdapterErrorBoundary onError={onError}>
        <ThrowsNull />
      </ResourceAdapterErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();
  });

  it("recovers via the Try again button once the cause is gone", () => {
    crash.active = true;

    render(
      <ResourceAdapterErrorBoundary>
        <MaybeBomb />
      </ResourceAdapterErrorBoundary>,
    );
    expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();

    crash.active = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("recovered content")).toBeVisible();
    expect(
      screen.queryByTestId("resource-adapter-error-fallback"),
    ).not.toBeInTheDocument();
  });

  it("recovers when a reset key changes", () => {
    crash.active = true;

    const { rerender } = render(
      <ResourceAdapterErrorBoundary resetKeys={["lesson-one"]}>
        <MaybeBomb />
      </ResourceAdapterErrorBoundary>,
    );
    expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();

    crash.active = false;
    rerender(
      <ResourceAdapterErrorBoundary resetKeys={["lesson-two"]}>
        <MaybeBomb />
      </ResourceAdapterErrorBoundary>,
    );

    expect(screen.getByText("recovered content")).toBeVisible();
  });

  it("renders a custom fallback instead of the default", () => {
    render(
      <ResourceAdapterErrorBoundary fallback={() => <p>custom fallback</p>}>
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    expect(screen.getByText("custom fallback")).toBeVisible();
    expect(
      screen.queryByTestId("resource-adapter-error-fallback"),
    ).not.toBeInTheDocument();
  });

  it("adds no heading of its own, leaving the host page's structure intact", () => {
    render(
      <ResourceAdapterErrorBoundary>
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    const fallback = screen.getByTestId("resource-adapter-error-fallback");
    expect(within(fallback).queryAllByRole("heading")).toHaveLength(0);
  });

  // The surrounding UI is intact here, so role="alert" is enough. The case that
  // does take focus is the dialog's shell fallback, tested in its own file.
  it("does not move focus, leaving the host page's focus alone", () => {
    render(
      <ResourceAdapterErrorBoundary>
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    expect(screen.getByTestId("resource-adapter-error-fallback")).not.toHaveFocus();
  });

  it("gives the fallback's Try again an explicit button type", () => {
    render(
      <ResourceAdapterErrorBoundary>
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    // Without it the default inside a host form would be submit.
    expect(screen.getByRole("button", { name: "Try again" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("leaves focus alone when recovery happens with the page still focused", () => {
    crash.active = true;
    const { rerender } = render(
      <>
        <button type="button">host control</button>
        <ResourceAdapterErrorBoundary resetKeys={["first"]}>
          <MaybeBomb />
        </ResourceAdapterErrorBoundary>
      </>,
    );
    const hostControl = screen.getByRole("button", { name: "host control" });
    hostControl.focus();

    crash.active = false;
    rerender(
      <>
        <button type="button">host control</button>
        <ResourceAdapterErrorBoundary resetKeys={["second"]}>
          <MaybeBomb />
        </ResourceAdapterErrorBoundary>
      </>,
    );

    expect(screen.getByText("recovered content")).toBeVisible();
    expect(hostControl).toHaveFocus();
  });
});
