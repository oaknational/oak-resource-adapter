// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DialogNotice, type DialogNoticeProps } from "./DialogNotice.js";

function renderNotice(props: Partial<DialogNoticeProps> = {}) {
  const secondary = vi.fn();
  render(
    <OakThemeProvider theme={oakDefaultTheme}>
      <DialogNotice
        heading="You can adapt up to 3 resources a month"
        secondaryAction={{ label: "Back to lesson", onClick: secondary }}
        {...props}
      >
        <p>Your limit resets next month.</p>
      </DialogNotice>
    </OakThemeProvider>,
  );
  return { secondary };
}

describe("DialogNotice", () => {
  it("moves focus to its heading, one level below the dialog's title", () => {
    renderNotice();

    const heading = screen.getByRole("heading", {
      level: 3,
      name: "You can adapt up to 3 resources a month",
    });
    expect(heading).toHaveFocus();
    expect(screen.getByText("Your limit resets next month.")).toBeVisible();
  });

  it("shows only the secondary action when there is no primary action", async () => {
    const { secondary } = renderNotice();

    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Back to lesson" }));
    expect(secondary).toHaveBeenCalledOnce();
  });

  it("puts the primary action after the secondary one", async () => {
    const primary = vi.fn();
    renderNotice({ primaryAction: { label: "Start adapting", onClick: primary } });

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Back to lesson",
      "Start adapting",
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Start adapting" }));
    expect(primary).toHaveBeenCalledOnce();
  });
});
