import type { TransformationWorkbench } from "./useTransformationWorkbench";
import styles from "../../page.module.css";

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
        <p className={styles.errorMessage} role="alert">
          {error}
        </p>
      )}

      {preview !== null && (
        <section className={styles.resultPanel}>
          <h2>Prompt preview</h2>
          {preview.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {preview.prompt === null ? (
            <p>This deterministic transformation has no model prompt.</p>
          ) : (
            <>
              <p>
                <code>{preview.prompt.identifier}</code>, version{" "}
                {preview.prompt.version}
              </p>
              <pre aria-label="Rendered prompt" role="region" tabIndex={0}>
                <code>{preview.prompt.text}</code>
              </pre>
            </>
          )}
        </section>
      )}

      {result !== null && (
        <section aria-live="polite" className={styles.resultPanel}>
          <h2>Run result: {result.run.outcome}</h2>
          {result.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {result.run.outcome === "TEXT" && <pre>{result.run.text}</pre>}
          {result.run.outcome === "UNUSABLE" && <p>{result.run.reason}</p>}
          {companions.length > 0 && (
            <details className={styles.markupDetails}>
              <summary>
                {companions.length} companion document
                {companions.length === 1 ? "" : "s"}
              </summary>
              {companions.map(({ document }) => (
                <pre
                  aria-label={`Companion document ${document.id} as JSON`}
                  key={document.id}
                  role="region"
                  tabIndex={0}
                >
                  <code>{JSON.stringify(document, null, 2)}</code>
                </pre>
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
