// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { describe, expect, it, vi } from "vitest";

import { ResourceAdapterButton } from "./ResourceAdapterButton.js";

describe("ResourceAdapterButton", () => {
  it("renders the trigger and forwards clicks", () => {
    const onClick = vi.fn();

    render(
      <OakThemeProvider theme={oakDefaultTheme}>
        <ResourceAdapterButton onClick={onClick} />
      </OakThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create more with AI" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
