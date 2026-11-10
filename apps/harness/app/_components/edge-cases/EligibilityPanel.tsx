"use client";

import type {
  LessonContext,
  ResourceAdapterLauncherAccount,
} from "@oaknational/resource-adapter";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  describeEligibility,
  loadEligibility,
  type EvaluatedEligibility,
} from "./eligibility";
import { useKeepViewAs } from "../shared/ViewAs";
import styles from "./EligibilityPanel.module.css";

function perspective(
  account: Exclude<ResourceAdapterLauncherAccount, "needsSetup">,
  inCopyrightRegion: boolean | null,
): string {
  if (account === "signedOut") {
    return "As a signed-out visitor.";
  }
  return inCopyrightRegion
    ? "As you, in a copyright region."
    : "As you, outside the copyright regions.";
}

export function EligibilityPanel({
  account,
  inCopyrightRegion,
  lesson,
}: Readonly<{
  account: ResourceAdapterLauncherAccount | null;
  inCopyrightRegion: boolean | null;
  lesson: LessonContext;
}>) {
  const keepViewAs = useKeepViewAs();
  const [evaluated, setEvaluated] = useState<EvaluatedEligibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asTeacher = account === "ready" && inCopyrightRegion !== null;

  useEffect(() => {
    setEvaluated(null);
    setError(null);
    if (account === null) {
      return;
    }
    const controller = new AbortController();
    loadEligibility(
      { lesson, ...(asTeacher ? { teacher: { inCopyrightRegion } } : {}) },
      controller.signal,
    )
      .then((loaded) => {
        if (loaded !== null) {
          setEvaluated(loaded);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error ? cause.message : "The rules could not be checked.",
          );
        }
      });
    return () => controller.abort();
  }, [account, asTeacher, inCopyrightRegion, lesson]);

  return (
    <section aria-labelledby="eligibility-heading" className={styles.panel}>
      <h2 id="eligibility-heading">ORA&apos;s decision</h2>
      {account === "needsSetup" ? (
        <p className={styles.setup}>
          <strong>Finish onboarding before ORA is available.</strong>
        </p>
      ) : (
        account !== null && <p>{perspective(account, inCopyrightRegion)}</p>
      )}
      {error !== null && <p role="alert">{error}</p>}
      {error === null && evaluated === null && (
        <p aria-live="polite" role="status">
          Checking the rules…
        </p>
      )}
      {evaluated !== null && account === "needsSetup" && (
        <p>If onboarding were finished, as for a signed-out visitor:</p>
      )}
      {evaluated !== null && (
        <ul
          className={`${styles.lines} ${account === "needsSetup" ? styles.hypothetical : ""}`}
          data-testid="eligibility-decision"
        >
          {describeEligibility(evaluated.evaluation, evaluated.catalogue).map(
            ({ offered, refusedBy, subject }) => (
              <li className={offered ? styles.offered : styles.refused} key={subject}>
                <strong>
                  {subject} {offered ? "is offered" : "isn't offered"}
                </strong>
                {refusedBy !== undefined && (
                  <>
                    {": "}
                    <Link href={keepViewAs(`/?view=rules#${refusedBy.anchor}`)}>
                      {refusedBy.condition}
                    </Link>{" "}
                    ({refusedBy.reason})
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {evaluated !== null && (
        <p className={styles.firstOnly}>
          Only the first rule that blocks each one is shown. Others may block it too.
        </p>
      )}
    </section>
  );
}
