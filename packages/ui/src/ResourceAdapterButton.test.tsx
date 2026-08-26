// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "@testing-library/user-event";

import { ResourceAdapterButton } from "./ResourceAdapterButton.js";
import type { ResourceAdapterCapability } from "./publicTypes.js";

const worksheet: ResourceAdapterCapability = {
  id: "worksheetScaffolding",
  label: "Scaffold practice tasks",
  resourceType: "worksheet",
};

// The union carries one capability id, so the multi-choice cases need a
// fictional one.
const futureCapability = {
  ...worksheet,
  id: "quizAdapter",
  label: "Create a practice quiz",
} as unknown as ResourceAdapterCapability;

function renderButton(
  capabilities: readonly ResourceAdapterCapability[],
  onSelectCapability = vi.fn(),
) {
  render(
    <OakThemeProvider theme={oakDefaultTheme}>
      <ResourceAdapterButton
        capabilities={capabilities}
        onSelectCapability={onSelectCapability}
      />
    </OakThemeProvider>,
  );

  return onSelectCapability;
}

describe("ResourceAdapterButton", () => {
  it("renders nothing when no capabilities are available", () => {
    renderButton([]);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a direct capability action when exactly one is available", () => {
    const onSelectCapability = renderButton([worksheet]);

    fireEvent.click(screen.getByRole("button", { name: "Scaffold practice tasks" }));
    expect(onSelectCapability).toHaveBeenCalledWith(worksheet);
  });

  it("renders a capability menu when more than one is available", async () => {
    const onSelectCapability = renderButton([worksheet, futureCapability]);

    const trigger = screen.getByRole("button", { name: "Create more with AI" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Scaffold practice tasks" }),
    );
    expect(onSelectCapability).toHaveBeenCalledWith(worksheet);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("reopens a closed menu after a selection", async () => {
    renderButton([worksheet, futureCapability]);

    fireEvent.click(screen.getByRole("button", { name: "Create more with AI" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Scaffold practice tasks" }),
    );

    const trigger = screen.getByRole("button", { name: "Create more with AI" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("closes the capability menu with Escape", () => {
    renderButton([worksheet, futureCapability]);

    fireEvent.click(screen.getByRole("button", { name: "Create more with AI" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens and selects a capability using only the keyboard", async () => {
    const user = userEvent.setup();
    const onSelectCapability = renderButton([worksheet, futureCapability]);
    const trigger = screen.getByRole("button", { name: "Create more with AI" });

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");

    const firstCapability = within(screen.getByRole("menu")).getByRole("menuitem", {
      name: "Scaffold practice tasks",
    });
    await user.tab();
    expect(firstCapability).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onSelectCapability).toHaveBeenCalledWith(worksheet);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
