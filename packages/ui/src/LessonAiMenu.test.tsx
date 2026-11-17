// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { userEvent } from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { LessonAiMenu } from "./LessonAiMenu.js";

const lesson = { lessonSlug: "adding-fractions", programmeSlug: "maths-primary-ks2" };

function renderMenu(props: Partial<ComponentProps<typeof LessonAiMenu>> = {}) {
  const onSelect = vi.fn();
  const track = vi.fn();
  render(
    <OakThemeProvider theme={oakDefaultTheme}>
      <LessonAiMenu
        adaptItems={[{ key: "worksheet", label: "Scaffold practice tasks", onSelect }]}
        lesson={lesson}
        teachingMaterials={["additional-glossary", "additional-exit-quiz"]}
        track={track}
        {...props}
      />
    </OakThemeProvider>,
  );
  return { onSelect, track };
}

const trigger = () => screen.getByRole("button", { name: "Adapt with AI" });

describe("LessonAiMenu", () => {
  it("renders nothing with neither an Adapt nor a Create item", () => {
    renderMenu({ adaptItems: [], teachingMaterials: [] });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("groups the items under their section headings", async () => {
    renderMenu();
    await userEvent.click(trigger());

    const menu = screen.getByRole("menu", { name: "Adapt with AI" });
    expect(within(menu).getAllByRole("group")).toHaveLength(3);
    expect(
      within(screen.getByRole("group", { name: "Adapt with AI" }))
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Scaffold practice tasks"]);
    expect(
      within(screen.getByRole("group", { name: "Create with AI" }))
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Glossary (opens in a new tab)",
      "More exit quiz questions (opens in a new tab)",
    ]);
    expect(
      within(screen.getByRole("group", { name: "Learn more" })).getByRole("menuitem", {
        name: "About Oak's AI (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "https://www.oaknationalacademy.com/ai");
  });

  it("leaves out Adapt with AI when it has no items", async () => {
    renderMenu({ adaptItems: [] });
    await userEvent.click(trigger());

    expect(
      screen.queryByRole("group", { name: "Adapt with AI" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Create with AI" })).toBeVisible();
  });

  it("leaves out Create with AI when the lesson gets no teaching materials", async () => {
    renderMenu({ teachingMaterials: [] });
    await userEvent.click(trigger());

    expect(
      screen.queryByRole("group", { name: "Create with AI" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Adapt with AI" })).toBeVisible();
  });

  it("links each teaching material to labs in a new tab", async () => {
    const { track } = renderMenu();
    await userEvent.click(trigger());

    const glossary = screen.getByRole("menuitem", {
      name: "Glossary (opens in a new tab)",
    });
    expect(glossary).toHaveAttribute(
      "href",
      "https://labs.thenational.academy/aila/teaching-materials?lessonSlug=adding-fractions&programmeSlug=maths-primary-ks2&docType=additional-glossary",
    );
    expect(glossary).toHaveAttribute("target", "_blank");

    glossary.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(glossary);
    expect(track).toHaveBeenCalledWith({
      name: "Teaching Materials Selected",
      teachingMaterialType: "glossary",
    });
  });

  it("closes after an Adapt item is chosen, and opens again", async () => {
    const { onSelect } = renderMenu();
    await userEvent.click(trigger());
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Scaffold practice tasks" }),
    );

    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(trigger());
    expect(screen.getByRole("menu")).toBeVisible();
  });

  it("moves focus to the trigger before an Adapt item opens anything", async () => {
    let focusedOnSelect: Element | null = null;
    renderMenu({
      adaptItems: [
        {
          key: "worksheet",
          label: "Scaffold practice tasks",
          onSelect: () => {
            focusedOnSelect = document.activeElement;
          },
        },
      ],
    });
    await userEvent.click(trigger());
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Scaffold practice tasks" }),
    );

    expect(focusedOnSelect).toBe(trigger());
  });

  it("reports each opening once, and not closing", async () => {
    const { track } = renderMenu();
    await userEvent.click(trigger());
    await userEvent.click(trigger());
    await userEvent.click(trigger());

    const opened = {
      name: "Lesson AI Menu Opened",
      componentType: "adapt_with_ai_button",
    };
    expect(track.mock.calls).toEqual([[opened], [opened]]);
  });

  it("opens, moves and chooses with the keyboard alone", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderMenu();

    await user.tab();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Enter}");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: "Scaffold practice tasks" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("closes with Escape", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
