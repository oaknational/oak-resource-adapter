"use client";

import { useCallback, type ReactNode } from "react";
import {
  OakFlex,
  OakLI,
  OakLink,
  OakP,
  OakSmallSecondaryButton,
  OakUL,
} from "@oaknational/oak-components";
import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";

import { VisibleLoadingSpinner } from "../../VisibleLoadingSpinner.js";

type ScaffoldSuggestion = WorksheetScaffoldingState["suggestions"][number];

export function QuestionCard({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <OakFlex
      $background="bg-primary"
      $ba="border-solid-s"
      $borderColor="border-neutral-lighter"
      $borderRadius="border-radius-m2"
      $flexDirection="column"
      $pa="spacing-20"
    >
      {children}
    </OakFlex>
  );
}

export function groupSuggestionsByTarget(
  suggestions: WorksheetScaffoldingState["suggestions"],
): Map<ScaffoldSuggestion["targetBlockId"], ScaffoldSuggestion[]> {
  const grouped = new Map<ScaffoldSuggestion["targetBlockId"], ScaffoldSuggestion[]>();

  for (const suggestion of suggestions) {
    const existing = grouped.get(suggestion.targetBlockId);
    if (existing === undefined) {
      grouped.set(suggestion.targetBlockId, [suggestion]);
    } else {
      existing.push(suggestion);
    }
  }

  return grouped;
}

type ScaffoldOption = Readonly<{
  key: string;
  label: string;
  params: ScaffoldSuggestion["params"] | undefined;
  suggestionId: string;
}>;

function scaffoldOptionsFor(suggestion: ScaffoldSuggestion): ScaffoldOption[] {
  const [choice] = suggestion.inputs ?? [];

  if (choice === undefined) {
    return [
      {
        key: suggestion.id,
        label: suggestion.label,
        params: undefined,
        suggestionId: suggestion.id,
      },
    ];
  }

  return choice.options.map((option) => ({
    key: `${suggestion.id}:${option.value}`,
    label: option.label,
    params: { ...suggestion.params, [choice.id]: option.value },
    suggestionId: suggestion.id,
  }));
}

// Applying removes the chosen button, so focus moves to the progress marker.
function LocalProgress() {
  const focusOnMount = useCallback((node: HTMLDivElement | null) => {
    node?.focus();
  }, []);

  return (
    <OakFlex
      $alignItems="center"
      $gap="spacing-8"
      aria-live="polite"
      ref={focusOnMount}
      tabIndex={-1}
    >
      <VisibleLoadingSpinner
        aria-hidden="true"
        data-testid="worksheet-scaffolding-local-spinner"
      />
      <OakP $font="body-3">Working on it&hellip;</OakP>
    </OakFlex>
  );
}

export function SuggestionGroup({
  applyDisabled,
  applyingSuggestionId,
  disabled,
  onApply,
  onDismiss,
  suggestions,
}: Readonly<{
  applyDisabled: boolean;
  applyingSuggestionId: string | null;
  disabled: boolean;
  onApply: (suggestionId: string, params: ScaffoldOption["params"]) => void;
  onDismiss: () => void;
  suggestions: readonly ScaffoldSuggestion[];
}>) {
  const isApplyingHere = suggestions.some(({ id }) => id === applyingSuggestionId);
  const options = suggestions
    .filter(({ id }) => id !== applyingSuggestionId)
    .flatMap(scaffoldOptionsFor);

  return (
    <OakFlex
      $flexDirection="column"
      $gap="spacing-12"
      aria-label="Suggested scaffolds"
      role="group"
    >
      {isApplyingHere && <LocalProgress />}
      <OakUL
        $alignItems="center"
        $display="flex"
        $flexWrap="wrap"
        $gap="spacing-12"
        $reset
      >
        {options.map((option) => (
          <OakLI key={option.key}>
            <OakSmallSecondaryButton
              disabled={disabled || applyDisabled}
              iconName="ai"
              onClick={() => onApply(option.suggestionId, option.params)}
            >
              {option.label}
            </OakSmallSecondaryButton>
          </OakLI>
        ))}
        {!isApplyingHere && (
          <OakLI>
            <OakLink
              $font="body-3"
              color="text-subdued"
              disabled={disabled}
              element="button"
              iconName="cross"
              onClick={onDismiss}
              type="button"
              variant="secondary"
            >
              No scaffold required
            </OakLink>
          </OakLI>
        )}
      </OakUL>
    </OakFlex>
  );
}
