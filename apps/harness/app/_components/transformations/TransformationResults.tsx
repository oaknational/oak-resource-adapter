import type { TransformationWorkbench } from "./useTransformationWorkbench";
import shared from "../shared/shared.module.css";

type TransformationResultsProps = Pick<
  TransformationWorkbench,
  "adoptOutput" | "companions" | "error" | "outputDocument" | "preview" | "result"
>;

export function TransformationResults({
  adoptOutput,
  companions,
  error,
  outputDocument,
  preview,
  result,
}: TransformationResultsProps) {
  return (
    <>
      {error !== null && (
        <p className={shared.errorMessage} role="alert">
          {error}
        </p>
      )}

      {preview !== null && (
        <section className={shared.resultPanel}>
          <h2>Prompt preview</h2>
          {preview.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {preview.prompt === null ? (
            <p>This deterministic transformation has no model prompt.</p>
          ) : (
            <>
              <p>
                <code>{preview.prompt.identifier}</code>
              </p>
              {/* Focusable so a keyboard can scroll it, which WCAG 2.1.1 requires. */}
              <section aria-label="Rendered prompt" tabIndex={0}>
                <pre>
                  <code>{preview.prompt.text}</code>
                </pre>
              </section>
            </>
          )}
        </section>
      )}

      {result !== null && (
        <section aria-live="polite" className={shared.resultPanel}>
          <h2>Run result: {result.run.outcome}</h2>
          {result.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {result.run.outcome === "TEXT" && <pre>{result.run.text}</pre>}
          {result.run.outcome === "UNUSABLE" && <p>{result.run.reason}</p>}
          {companions.length > 0 && (
            <details className={shared.markupDetails}>
              <summary>
                {companions.length} companion document
                {companions.length === 1 ? "" : "s"}
              </summary>
              {companions.map(({ document }) => (
                <section
                  aria-label={`Companion document ${document.id} as JSON`}
                  key={document.id}
                  tabIndex={0}
                >
                  <pre>
                    <code>{JSON.stringify(document, null, 2)}</code>
                  </pre>
                </section>
              ))}
            </details>
          )}
          {outputDocument !== undefined && (
            <button onClick={adoptOutput} type="button">
              Use revised resource as next input
            </button>
          )}
        </section>
      )}
    </>
  );
}
