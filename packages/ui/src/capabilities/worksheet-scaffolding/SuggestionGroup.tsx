"use client";

import { useEffect, useId, useRef } from "react";
import { OakP, OakSecondaryButton, parseColor } from "@oaknational/oak-components";
import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";
import { styled } from "styled-components";

import { VisibleLoadingSpinner } from "./styles.js";

type ScaffoldSuggestion = WorksheetScaffoldingState["suggestions"][number];

const GroupPanel = styled.div`
  background: ${parseColor("bg-neutral")};
  border: 1px solid ${parseColor("border-neutral-lighter")};
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0.5rem 0 1rem;
  padding: 0.75rem;

  /* Keeps a focused button clear of the sticky status banner above it. */
  button {
    scroll-margin-top: 7rem;
  }
`;

const SuggestionList = styled.ul`
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;

  button {
    min-height: 3.5rem;
  }
`;

const LocalWorking = styled.div`
  align-items: center;
  display: flex;
  gap: 0.75rem;
  min-height: 3rem;
`;

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
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <LocalWorking aria-live="polite" ref={ref} tabIndex={-1}>
      <VisibleLoadingSpinner
        aria-hidden="true"
        data-testid="worksheet-scaffolding-local-spinner"
      />
      <OakP $font="body-2">Working on it&hellip;</OakP>
    </LocalWorking>
  );
}

export function SuggestionGroup({
  applyingSuggestionId,
  disabled,
  onApply,
  onDismiss,
  suggestions,
}: Readonly<{
  applyingSuggestionId: string | null;
  disabled: boolean;
  onApply: (suggestionId: string, params: ScaffoldOption["params"]) => void;
  onDismiss: () => void;
  suggestions: readonly ScaffoldSuggestion[];
}>) {
  const headingId = useId();
  const isApplyingHere = suggestions.some(({ id }) => id === applyingSuggestionId);
  const options = suggestions
    .filter(({ id }) => id !== applyingSuggestionId)
    .flatMap(scaffoldOptionsFor);

  return (
    <GroupPanel aria-labelledby={headingId} role="group">
      <OakP $font="heading-7" id={headingId}>
        Suggested scaffolds
      </OakP>
      {isApplyingHere && <LocalProgress />}
      <SuggestionList>
        {options.map((option) => (
          <li key={option.key}>
            <OakSecondaryButton
              disabled={disabled}
              onClick={() => onApply(option.suggestionId, option.params)}
            >
              {option.label}
            </OakSecondaryButton>
          </li>
        ))}
        <li>
          <OakSecondaryButton disabled={disabled} iconName="cross" onClick={onDismiss}>
            No scaffold required
          </OakSecondaryButton>
        </li>
      </SuggestionList>
    </GroupPanel>
  );
}
