"use client";

import { useEffect, useRef } from "react";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import {
  OakButtonWithDropdown,
  OakIcon,
  OakPrimaryButton,
} from "@oaknational/oak-components";

import { AiMenuButton, AiMenuLink, AiMenuSection, LearnMoreSection } from "./AiMenu.js";
import type { TrackLessonAiMenuEvent } from "./analytics.js";
import {
  teachingMaterialHref,
  teachingMaterialsFor,
  type ResourceAdapterTeachingMaterialId,
} from "./teachingMaterials.js";

export type LessonAiMenuItem = Readonly<{
  key: string;
  label: string;
  onSelect: () => void;
}>;

export function LessonAiMenu({
  adaptItems,
  lesson,
  teachingMaterials,
  track,
}: Readonly<{
  adaptItems: readonly LessonAiMenuItem[];
  lesson: Pick<LessonContext, "lessonSlug" | "programmeSlug">;
  teachingMaterials: readonly ResourceAdapterTeachingMaterialId[];
  track: TrackLessonAiMenuEvent;
}>) {
  const container = useRef<HTMLDivElement>(null);
  const materials = teachingMaterialsFor(teachingMaterials);
  if (adaptItems.length === 0 && materials.length === 0) {
    return null;
  }

  // The chosen item unmounts as the dialog opens, so the dialog's focus lock would
  // record <body> to return to. Moving focus first makes it return to the trigger.
  const focusTrigger = () =>
    container.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();

  return (
    <div ref={container}>
      <OakButtonWithDropdown
        buttonComponent={OakPrimaryButton}
        dropdownProps={{ "aria-label": "Adapt with AI", role: "menu" }}
        leadingButtonIcon={
          <OakIcon
            $colorFilter="icon-inverted"
            $mr="spacing-8"
            iconHeight="spacing-24"
            iconName="ai"
            iconWidth="spacing-24"
          />
        }
        primaryActionText="Adapt with AI"
      >
        <TrackOpened track={track} />
        {adaptItems.length > 0 && (
          <AiMenuSection heading="Adapt with AI">
            {adaptItems.map(({ key, label, onSelect }) => (
              <AiMenuButton
                key={key}
                onSelect={() => {
                  focusTrigger();
                  onSelect();
                }}
              >
                {label}
              </AiMenuButton>
            ))}
          </AiMenuSection>
        )}
        {adaptItems.length > 0 && materials.length > 0 && (
          <OakButtonWithDropdown.Divider />
        )}
        {materials.length > 0 && (
          <AiMenuSection heading="Create with AI">
            {materials.map(({ analyticsType, id, label }) => (
              <AiMenuLink
                href={teachingMaterialHref(lesson, id)}
                key={id}
                onSelect={() =>
                  track({
                    name: "Teaching Materials Selected",
                    teachingMaterialType: analyticsType,
                  })
                }
              >
                {label}
              </AiMenuLink>
            ))}
          </AiMenuSection>
        )}
        <LearnMoreSection
          onSelect={() =>
            track({
              name: "About Oak AI Selected",
              componentType: "lesson_ai_menu_item",
            })
          }
        />
      </OakButtonWithDropdown>
    </div>
  );
}

/** The panel mounts on every open, while the trigger's callback also fires on close. */
function TrackOpened({ track }: Readonly<{ track: TrackLessonAiMenuEvent }>) {
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    track({ name: "Lesson AI Menu Opened", componentType: "adapt_with_ai_button" });
  }, [track]);
  return null;
}
