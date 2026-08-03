// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceAdapterErrorBoundary } from "./ResourceAdapterErrorBoundary.js";
import { reportClientError } from "./reportClientError.js";

vi.mock("./reportClientError.js", () => ({
  reportClientError: vi.fn().mockResolvedValue(undefined),
}));

const reporting = {
  getToken: async () => "clerk-token",
  trpcEndpoint: "https://resource-adapter-api.example/trpc/v1",
};

function renderWithTheme(children: ReactNode) {
  const result = render(
    <OakThemeProvider theme={oakDefaultTheme}>{children}</OakThemeProvider>,
  );

  return {
    ...result,
    rerenderWithTheme: (next: ReactNode) =>
      result.rerender(
        <OakThemeProvider theme={oakDefaultTheme}>{next}</OakThemeProvider>,
      ),
  };
}

function Bomb({ message = "Deterministic test crash" }: { message?: string }): never {
  throw new Error(message);
}

function ThrowsString(): never {
  throw "a string, not an Error";
}

// jsdom does not fire `unhandledrejection`, so the rejection has to be observed
// on the node process. Declared locally because this package deliberately keeps
// node types out of scope for its browser-facing source.
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
    vi.mocked(reportClientError).mockClear();
  });

  it("renders its children when nothing throws", () => {
    renderWithTheme(
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
    renderWithTheme(
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

    renderWithTheme(
      <ResourceAdapterErrorBoundary onError={onError}>
        <Bomb message="dialog exploded" />
      </ResourceAdapterErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "dialog exploded" }),
      expect.objectContaining({ componentStack: expect.stringContaining("Bomb") }),
    );
  });

  it("reports to the API when reporting credentials are provided", () => {
    renderWithTheme(
      <ResourceAdapterErrorBoundary reporting={reporting}>
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    expect(reportClientError).toHaveBeenCalledExactlyOnceWith({
      componentStack: expect.stringContaining("Bomb"),
      error: expect.objectContaining({ message: "Deterministic test crash" }),
      reporting,
    });
  });

  it("skips API reporting when no credentials are provided", () => {
    renderWithTheme(
      <ResourceAdapterErrorBoundary>
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    expect(reportClientError).not.toHaveBeenCalled();
  });

  it("still reports to the API and renders the fallback when onError throws", () => {
    renderWithTheme(
      <ResourceAdapterErrorBoundary
        onError={() => {
          throw new Error("broken host callback");
        }}
        reporting={reporting}
      >
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    expect(reportClientError).toHaveBeenCalledOnce();
    expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();
  });

  it("swallows a rejection from an async onError", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      renderWithTheme(
        <ResourceAdapterErrorBoundary
          onError={async () => {
            throw new Error("broken async host callback");
          }}
          reporting={reporting}
        >
          <Bomb />
        </ResourceAdapterErrorBoundary>,
      );

      // Rejections surface a tick later, so let the microtask queue drain.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).not.toHaveBeenCalled();
      expect(reportClientError).toHaveBeenCalledOnce();
      expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("reports one crash exactly once under StrictMode", () => {
    const onError = vi.fn();

    renderWithTheme(
      <StrictMode>
        <ResourceAdapterErrorBoundary onError={onError} reporting={reporting}>
          <Bomb />
        </ResourceAdapterErrorBoundary>
      </StrictMode>,
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(reportClientError).toHaveBeenCalledOnce();
  });

  it("coerces a non-Error throw into an Error for both reporting paths", () => {
    const onError = vi.fn();

    renderWithTheme(
      <ResourceAdapterErrorBoundary onError={onError}>
        <ThrowsString />
      </ResourceAdapterErrorBoundary>,
    );

    const [caught] = onError.mock.calls[0] ?? [];
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("a string, not an Error");
  });

  it("recovers via the Try again button once the cause is gone", () => {
    crash.active = true;

    renderWithTheme(
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

    const { rerenderWithTheme } = renderWithTheme(
      <ResourceAdapterErrorBoundary resetKeys={["lesson-one"]}>
        <MaybeBomb />
      </ResourceAdapterErrorBoundary>,
    );
    expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();

    crash.active = false;
    rerenderWithTheme(
      <ResourceAdapterErrorBoundary resetKeys={["lesson-two"]}>
        <MaybeBomb />
      </ResourceAdapterErrorBoundary>,
    );

    expect(screen.getByText("recovered content")).toBeVisible();
  });

  it("renders a custom fallback instead of the default", () => {
    renderWithTheme(
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
    renderWithTheme(
      <ResourceAdapterErrorBoundary>
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    // OakInlineBanner's title is an h1, which would give the host a second one.
    const fallback = screen.getByTestId("resource-adapter-error-fallback");
    expect(within(fallback).queryAllByRole("heading")).toHaveLength(0);
  });

  // The surrounding UI is intact here, so role="alert" is enough. The case that
  // does take focus is the dialog's shell fallback, tested in its own file.
  it("does not move focus, leaving the host page's focus alone", () => {
    renderWithTheme(
      <ResourceAdapterErrorBoundary>
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    expect(screen.getByTestId("resource-adapter-error-fallback")).not.toHaveFocus();
  });

  it("gives the fallback's Try again an explicit button type", () => {
    renderWithTheme(
      <ResourceAdapterErrorBoundary>
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    // oak-components renders a bare `button`, which would submit a host form.
    expect(screen.getByRole("button", { name: "Try again" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("leaves focus alone when recovery happens with the page still focused", () => {
    crash.active = true;
    const { rerenderWithTheme } = renderWithTheme(
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
    rerenderWithTheme(
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
