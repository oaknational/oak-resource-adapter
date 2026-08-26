import type { SuggestionWorkbench } from "./useSuggestionWorkbench";
import styles from "../../page.module.css";

type SuggestionControlsProps = Pick<
  SuggestionWorkbench,
  | "canSubmit"
  | "flows"
  | "previewSelected"
  | "requestState"
  | "runSelected"
  | "selectedFlow"
  | "selectedFlowId"
  | "selectFlow"
>;

export function SuggestionControls({
  canSubmit,
  flows,
  previewSelected,
  requestState,
  runSelected,
  selectedFlow,
  selectedFlowId,
  selectFlow,
}: SuggestionControlsProps) {
  const requestMessages: Record<SuggestionWorkbench["requestState"], string | null> = {
    idle: null,
    preview: "Preparing the prompt…",
    run: "Running the suggestion agent…",
  };
  const requestMessage = requestMessages[requestState];

  return (
    <section aria-labelledby="suggestion-controls" className={styles.controls}>
      <div className={styles.controlHeader}>
        <h2 id="suggestion-controls">Suggestion flow</h2>
      </div>
      <div className={styles.controlGrid}>
        <label>
          <span>Flow</span>
          <select
            disabled={flows.length === 0}
            onChange={(event) => selectFlow(event.target.value)}
            value={selectedFlowId}
          >
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedFlow !== undefined && (
        <p className={styles.definitionMeta}>
          <span>Up to {selectedFlow.maxSuggestions} suggestions</span>
          <span>{selectedFlow.transformationKinds.length} registered kinds</span>
          <code>{selectedFlow.role}</code>
        </p>
      )}
      <div className={styles.actionBar}>
        <fieldset className={styles.primaryActions}>
          <legend className={styles.visuallyHidden}>Suggestion actions</legend>
          <button
            className={styles.primaryButton}
            disabled={!canSubmit || requestState !== "idle"}
            onClick={() => void runSelected()}
            type="button"
          >
            {requestState === "run" ? "Running…" : "Run suggestion agent"}
          </button>
          <button
            disabled={!canSubmit || requestState !== "idle"}
            onClick={() => void previewSelected()}
            type="button"
          >
            {requestState === "preview" ? "Preparing…" : "Preview prompt"}
          </button>
        </fieldset>
        <p aria-live="polite" className={styles.requestStatus} role="status">
          {requestMessage}
        </p>
      </div>
    </section>
  );
}
