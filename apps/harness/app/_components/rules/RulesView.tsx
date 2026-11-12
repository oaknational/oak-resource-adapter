"use client";

import type { RuleCatalogue } from "@oaknational/resource-adapter-dev-api-contracts";
import { OakInlineBanner } from "@oaknational/oak-components";
import { useEffect, useMemo, useState } from "react";

import shared from "../shared/shared.module.css";
import { buildRuleFlow } from "./rule-flow-model";
import { fetchRuleCatalogue } from "./rules-api";
import { SECTIONS } from "./FlowLayout";
import { RuleFlow } from "./RuleFlow";
import styles from "./RulesView.module.css";

function Rules({ catalogue }: Readonly<{ catalogue: RuleCatalogue }>) {
  const flow = useMemo(() => buildRuleFlow(catalogue), [catalogue]);

  // The browser looks for a link's target before the rules have loaded, so it
  // neither scrolls to it nor treats it as `:target`.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target =
      id === "" ? null : document.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (target !== null) {
      target.tabIndex = -1;
      target.focus();
    }
  }, []);

  return <RuleFlow catalogue={catalogue} flow={flow} />;
}

export function RulesView() {
  const [catalogue, setCatalogue] = useState<RuleCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRuleCatalogue()
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
      <h1>ORA rules</h1>
      <p>These determine what is offered to teachers.</p>

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

      <nav aria-label="Rule levels" className={styles.sectionNav}>
        {Object.values(SECTIONS).map(({ id, label }) => (
          <a href={`#${id}`} key={id}>
            {label}
          </a>
        ))}
      </nav>

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
      {catalogue !== null && <Rules catalogue={catalogue} />}
    </article>
  );
}
