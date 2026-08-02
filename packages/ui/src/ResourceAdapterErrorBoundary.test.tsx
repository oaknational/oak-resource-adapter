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

/** Throws until `crash.active` is cleared, for the recovery tests. */
const crash = { active: true };

function MaybeBomb() {
  if (crash.active) {
    throw new Error("transient crash");
  }
  return <p>recovered content</p>;
}

describe("ResourceAdapterErrorBoundary", () => {
  beforeEach(() => {
    // React logs every caught boundary error; keep test output readable.
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

    // OakInlineBanner renders its title as an h1, which would give a host
    // lesson page a second one.
    const fallback = screen.getByTestId("resource-adapter-error-fallback");
    expect(within(fallback).queryAllByRole("heading")).toHaveLength(0);
  });

  // The dialog's shell fallback is the case that does take focus, covered in
  // ResourceAdapterDialog.test.tsx: here the surrounding UI is intact, so
  // role="alert" announces the message without moving the teacher's focus.
  it("does not move focus, leaving the host page's focus alone", () => {
    renderWithTheme(
      <ResourceAdapterErrorBoundary>
        <Bomb />
      </ResourceAdapterErrorBoundary>,
    );

    expect(screen.getByTestId("resource-adapter-error-fallback")).not.toHaveFocus();
  });
});
