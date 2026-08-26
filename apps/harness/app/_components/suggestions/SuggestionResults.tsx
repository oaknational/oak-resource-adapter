import type { SuggestionWorkbench } from "./useSuggestionWorkbench";
import styles from "../../page.module.css";

type SuggestionResultsProps = Pick<SuggestionWorkbench, "error" | "preview" | "result">;

export function SuggestionResults({ error, preview, result }: SuggestionResultsProps) {
  return (
    <>
      {error !== null && (
        <p className={styles.errorMessage} role="alert">
          {error}
        </p>
      )}

      {preview !== null && (
        <section className={styles.resultPanel}>
          <h2>Prompt preview</h2>
          <p>
            <code>{preview.prompt.identifier}</code>
          </p>
          <p>
            {preview.candidates.length} eligible transformation
            {preview.candidates.length === 1 ? "" : "s"} for this fixture.
          </p>
          {preview.candidates.length > 0 && (
            <ul className={styles.candidateList}>
              {preview.candidates.map(({ eligibleTargets, kind, label, target }) => (
                <li key={kind}>
                  <strong>{label}</strong> <code>{kind}</code>
                  <small>
                    {eligibleTargets.scope === "document"
                      ? "Whole document"
                      : `Eligible ${target.scope === "node" ? target.nodeTypes.join("/") : "node"} IDs: ${eligibleTargets.blockIds.join(", ")}`}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {/* Focusable so a keyboard can scroll it, which WCAG 2.1.1 requires. */}
          <section aria-label="Rendered suggestion prompt" tabIndex={0}>
            <pre>
              <code>{preview.prompt.text}</code>
            </pre>
          </section>
        </section>
      )}

      {result !== null && (
        <section aria-live="polite" className={styles.resultPanel}>
          <h2>Suggestion result</h2>
          {result.suggestions.length === 0 ? (
            <p>The agent returned no suggestions for this fixture.</p>
          ) : (
            <ol className={styles.suggestionList}>
              {result.suggestions.map((suggestion) => (
                <li
                  className={styles.suggestionCard}
                  key={`${suggestion.kind}:${suggestion.targetBlockId ?? "document"}`}
                >
                  <h3>{suggestion.label}</h3>
                  <p>{suggestion.reason}</p>
                  <dl>
                    <div>
                      <dt>Kind</dt>
                      <dd>
                        <code>{suggestion.kind}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Target</dt>
                      <dd>
                        <code>{suggestion.targetBlockId ?? "whole document"}</code>
                      </dd>
                    </div>
                  </dl>
                  <details className={styles.markupDetails}>
                    <summary>Parameters</summary>
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
