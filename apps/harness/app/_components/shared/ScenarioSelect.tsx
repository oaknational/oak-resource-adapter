"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../page.module.css";
import type { ScenarioNavigationItem } from "./ScenarioNavigation";

type GroupedScenario = ScenarioNavigationItem & Readonly<{ group: string }>;

export function ScenarioSelect({
  items,
  label,
  selectedId,
  hrefFor,
}: Readonly<{
  items: readonly GroupedScenario[];
  label: string;
  selectedId: string;
  hrefFor: (id: string) => string;
}>) {
  const id = useId();
  const router = useRouter();
  // Navigating on change would move the page while a keyboard user is still
  // arrowing through the options, so the choice is committed by the button.
  const [choice, setChoice] = useState(selectedId);
  useEffect(() => setChoice(selectedId), [selectedId]);
  const selected = items.find((item) => item.id === selectedId);
  const groups = [...new Set(items.map((item) => item.group))];
  return (
    <div className={styles.scenarioSelect}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.scenarioSelectControls}>
        <select
          id={id}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <button
          className={styles.primaryButton}
          type="button"
          disabled={choice === selectedId}
          onClick={() => router.push(hrefFor(choice))}
        >
          Show
        </button>
      </div>
      {selected && (
        <div className={styles.selectedScenario}>
          <h2>{selected.title}</h2>
          <p>
            {selected.group} <span aria-hidden="true">·</span>{" "}
            <code>{selected.detail}</code>
          </p>
        </div>
      )}
    </div>
  );
}
