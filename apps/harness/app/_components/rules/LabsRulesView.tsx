"use client";

import type { TeachingMaterialsCatalogue } from "@oaknational/resource-adapter-dev-api-contracts";
import { OakInlineBanner } from "@oaknational/oak-components";
import { useEffect, useState } from "react";

import shared from "../shared/shared.module.css";
import { Box } from "./FlowLayout";
import { selectionNote } from "./labs-rules-model";
import { ruleAnchor } from "./rule-flow-model";
import { RuleDetails } from "./RuleDetails";
import { RuleRows } from "./RuleRows";
import { DisplayValues } from "./RuleValues";
import { fetchTeachingMaterialsCatalogue } from "./rules-api";
import styles from "./RulesView.module.css";

function LabsRuleFlow({
  catalogue,
}: Readonly<{ catalogue: TeachingMaterialsCatalogue }>) {
  const labelOf = (id: string) =>
    catalogue.materials.find((material) => material.id === id)?.label ?? id;

  return (
    <ol className={styles.boxes}>
      <Box number={1} question="Does a lesson get labs links?">
        <p className={styles.lead}>Not if any of these is true:</p>
        <RuleRows
          rows={catalogue.lesson.map((rule) => ({
            anchor: ruleAnchor("labs-lesson", rule.id),
            rule,
          }))}
        />
      </Box>
      <Box number={2} question="Which materials does it get?">
        <p className={styles.lead}>The first of these that is true decides:</p>
        <ul className={styles.rows}>
          {catalogue.selections.map((selection) => {
            const { materials, rule } = selection;
            const note = selectionNote(selection, catalogue.lesson);
            return (
              <li
                className={styles.row}
                id={ruleAnchor("labs-materials", rule.id)}
                key={rule.id}
              >
                <p className={styles.condition}>{rule.condition}</p>
                {rule.displayValues !== undefined && (
                  <DisplayValues
                    items={rule.displayValues}
                    label={rule.displayValuesLabel}
                  />
                )}
                {materials.length === 0 ? (
                  <p>
                    <span className={styles.keyword}>Then:</span> no materials
                  </p>
                ) : (
                  <DisplayValues items={materials.map(labelOf)} label="Then" />
                )}
                {note !== undefined && <p className={styles.note}>{note}</p>}
                <RuleDetails rule={rule} variesByScaffold={false} />
              </li>
            );
          })}
          <li className={styles.row}>
            <p className={styles.condition}>Otherwise</p>
            <DisplayValues
              items={catalogue.materials.map(({ label }) => label)}
              label="Then"
            />
          </li>
        </ul>
      </Box>
    </ol>
  );
}

export function LabsRulesView() {
  const [catalogue, setCatalogue] = useState<TeachingMaterialsCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTeachingMaterialsCatalogue()
      .then((value) => {
        if (!cancelled) {
          setCatalogue(value);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "The rules could not load.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <article className={`${shared.capabilities} ${styles.rules}`}>
      <h1>Labs rules</h1>
      <p>
        These decide which of labs&apos; teaching materials a lesson links to. They are
        separate from ORA&apos;s own rules.
      </p>

      <OakInlineBanner
        isOpen
        $mb="spacing-24"
        $mt="spacing-24"
        message={
          <p>
            <strong>Built from ORA&apos;s code.</strong> This page changes automatically
            when the code changes.
          </p>
        }
        type="info"
        variant="regular"
      />

      {error !== null && (
        <p className={shared.errorMessage} role="alert">
          {error}
        </p>
      )}
      {catalogue === null && error === null && (
        <p aria-live="polite" role="status">
          Loading the rules…
        </p>
      )}
      {catalogue !== null && <LabsRuleFlow catalogue={catalogue} />}
    </article>
  );
}
