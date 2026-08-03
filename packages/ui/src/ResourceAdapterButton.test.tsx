// @vitest-environment jsdom
import { type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceAdapterButton } from "./ResourceAdapterButton.js";

const buttonCrash = vi.hoisted(() => ({ active: false }));

// Swaps in a trigger that can be made to crash, which the real one cannot.
vi.mock("@oaknational/oak-components", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oaknational/oak-components")>();
  const { createElement } = await import("react");
  return {
    ...original,
    OakPrimaryButton: ({
      children,
      onClick,
    }: Readonly<{ children?: ReactNode; onClick?: () => void }>) => {
      if (buttonCrash.active) {
        throw new Error("trigger render crash");
      }
      return createElement("button", { onClick }, children);
    },
  };
});

function renderWithTheme(children: ReactNode) {
  return render(
    <OakThemeProvider theme={oakDefaultTheme}>{children}</OakThemeProvider>,
  );
}

describe("ResourceAdapterButton", () => {
  beforeEach(() => {
    buttonCrash.active = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the trigger and forwards clicks", () => {
    const onClick = vi.fn();
    renderWithTheme(<ResourceAdapterButton onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Create more with AI" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders nothing when the trigger crashes, sparing the host page", () => {
    buttonCrash.active = true;

    renderWithTheme(
      <>
        <p>host page content</p>
        <ResourceAdapterButton onClick={() => {}} />
      </>,
    );

    expect(screen.getByText("host page content")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("resource-adapter-error-fallback"),
    ).not.toBeInTheDocument();
  });
});
