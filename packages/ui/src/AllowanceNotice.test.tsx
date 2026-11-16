// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { describe, expect, it, vi } from "vitest";

import { AllowanceNotice } from "./AllowanceNotice.js";

function renderNotice(remaining: number, resetsAt = "2027-07-31T23:00:00.000Z") {
  render(
    <OakThemeProvider theme={oakDefaultTheme}>
      <AllowanceNotice
        allowance={{ limit: 5, remaining, resetsAt, tier: "limited" }}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />
    </OakThemeProvider>,
  );
}

function buttonLabels() {
  return screen.getAllByRole("button").map((button) => button.textContent);
}

describe("AllowanceNotice", () => {
  it.each([
    [5, "You can adapt up to 5 resources a month", "Start adapting"],
    [4, "You can adapt 4 more resources this month", "Continue adapting"],
    [1, "You can adapt 1 more resource this month", "Continue adapting"],
  ])("with %i left, offers to go on", (remaining, heading, primary) => {
    renderNotice(remaining);

    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(buttonLabels()).toEqual(["Back to lesson", primary]);
  });

  it("offers only the way back with none left", () => {
    renderNotice(0);

    expect(
      screen.getByRole("heading", { name: "You've adapted 5 resources this month" }),
    ).toBeVisible();
    expect(buttonLabels()).toEqual(["Back to lesson"]);
  });

  it("names the UK date the limit resets on", () => {
    renderNotice(5);

    expect(
      screen.getByText(
        "Outside the UK, you can adapt up to 5 lesson resources a month with AI. You can still make changes to resources you’ve already adapted, and your limit resets on 1 August 2027.",
      ),
    ).toBeVisible();
  });
});
