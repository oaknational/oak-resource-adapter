import { getResourceNodeById } from "@oaknational/resource-document";

import type { SuggestionWorkbench } from "./useSuggestionWorkbench";
import type { SuggestionPreviewResponse } from "./suggestion-api";
import { readableIdentifier } from "../shared/readable-identifier";
import { resourceNodeLabel } from "../shared/resource-node-label";
import styles from "../../page.module.css";
import type { ResourceDocument } from "@oaknational/resource-document";

type SuggestionResultsProps = Pick<
  SuggestionWorkbench,
  "error" | "preview" | "result"
> &
  Readonly<{ document: ResourceDocument }>;
type SuggestionCandidate = SuggestionPreviewResponse["candidates"][number];

function nodeLabel(document: ResourceDocument, blockId: string): string {
  const node = getResourceNodeById(document, blockId);
  return node === undefined ? blockId : resourceNodeLabel(node);
}

function eligibleTargetLabels(
  { eligibleTargets }: SuggestionCandidate,
  document: ResourceDocument,
): readonly string[] {
  return eligibleTargets.scope === "document"
    ? ["Whole document"]
    : eligibleTargets.blockIds.map((blockId) => nodeLabel(document, blockId));
}

function resultTarget(
  document: ResourceDocument,
  targetBlockId: string | null,
): string {
  return targetBlockId === null
    ? "Whole worksheet"
    : nodeLabel(document, targetBlockId);
}

export function SuggestionResults({
  document,
  error,
  preview,
  result,
}: SuggestionResultsProps) {
  return (
    <>
      {error !== null && (
        <p className={styles.errorMessage} role="alert">
          {error}
        </p>
      )}

      {preview !== null && (
        <section className={styles.resultPanel}>
          <p className={styles.profileKicker}>Prepared agent input</p>
          <h2>Choices available to the agent</h2>
          <p>
            {preview.candidates.length} transformation
            {preview.candidates.length === 1 ? " is" : "s are"} eligible for this
            worksheet. The agent receives the same use and avoid guidance shown here.
          </p>
          {preview.candidates.length > 0 && (
            <ul className={styles.candidateList}>
              {preview.candidates.map((candidate) => (
                <li key={candidate.kind}>
                  <div className={styles.candidateHeading}>
                    <h3>{candidate.label}</h3>
                    <code>{candidate.kind}</code>
                  </div>
                  <p className={styles.candidateDescription}>
                    {candidate.suggestion.description}
                  </p>
                  <div className={styles.guidanceGrid}>
                    <div className={styles.useGuidance}>
                      <h4>Use when</h4>
                      <p>{candidate.suggestion.useWhen}</p>
                    </div>
                    <div className={styles.avoidGuidance}>
                      <h4>Avoid when</h4>
                      <p>{candidate.suggestion.avoidWhen}</p>
                    </div>
                  </div>
                  <div className={styles.eligibleTargets}>
                    <strong id={`${candidate.kind}-placement`}>
                      Eligible placement
                    </strong>
                    <ul aria-labelledby={`${candidate.kind}-placement`}>
                      {eligibleTargetLabels(candidate, document).map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  </div>
                  {candidate.supportLevels !== undefined && (
                    <div className={styles.candidateLevels}>
                      <h4>Support options</h4>
                      <ul>
                        {candidate.supportLevels.map(({ description, level }) => (
                          <li key={level}>
                            <strong>{readableIdentifier(level)}</strong>
                            <span>{description}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {candidate.barriers !== undefined && (
                    <ul aria-label="Barriers addressed" className={styles.tagList}>
                      {candidate.barriers.map((barrier) => (
                        <li key={barrier}>{readableIdentifier(barrier)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          <details className={styles.markupDetails}>
            <summary>Exact prompt sent to the agent</summary>
            <p>
              <code>{preview.prompt.identifier}</code>
            </p>
            <section aria-label="Rendered suggestion prompt" tabIndex={0}>
              <pre>
                <code>{preview.prompt.text}</code>
              </pre>
            </section>
          </details>
        </section>
      )}

      {result !== null && (
        <section aria-live="polite" className={styles.resultPanel}>
          <h2>Suggestion result</h2>
          {result.suggestions.length === 0 ? (
            <p>The agent returned no suggestions for this fixture.</p>
          ) : (
            <ol className={styles.suggestionList}>
              {result.suggestions.map((suggestion, index) => (
                <li
                  className={styles.suggestionCard}
                  key={`${suggestion.kind}:${suggestion.targetBlockId ?? "document"}:${index}`}
                >
                  <p className={styles.profileKicker}>Agent recommendation</p>
                  <h3>{suggestion.label}</h3>
                  <p className={styles.suggestionReason}>{suggestion.reason}</p>
                  <dl>
                    <div>
                      <dt>Where it would be added</dt>
                      <dd>{resultTarget(document, suggestion.targetBlockId)}</dd>
                    </div>
                    {typeof suggestion.params.supportLevel === "string" && (
                      <div>
                        <dt>Support level</dt>
                        <dd>{readableIdentifier(suggestion.params.supportLevel)}</dd>
                      </div>
                    )}
                  </dl>
                  <details className={styles.markupDetails}>
                    <summary>Technical details</summary>
                    <p>
                      <code>{suggestion.kind}</code>
                    </p>
                    <pre>
                      <code>{JSON.stringify(suggestion.params, null, 2)}</code>
                    </pre>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </>
  );
}
