import type { SuggestionWorkbench } from "./useSuggestionWorkbench";
import shared from "../shared/shared.module.css";
import styles from "./SuggestionControls.module.css";

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
    <section aria-labelledby="suggestion-controls" className={shared.controls}>
      <div className={shared.controlHeader}>
        <h2 id="suggestion-controls">Suggestion flow</h2>
      </div>
      <div className={shared.controlGrid}>
        <label>
          <span>Flow</span>
          <select
            disabled={flows.length === 0}
            onChange={(event) => selectFlow(event.target.value)}
            value={selectedFlowId}
          >
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedFlow !== undefined && (
        <div className={styles.flowSummary}>
          <p className={shared.profileKicker}>What the agent is deciding</p>
          <h3>{selectedFlow.label}</h3>
          <p>
            Reviews this worksheet and can recommend up to {selectedFlow.maxSuggestions}{" "}
            suitable changes from {selectedFlow.transformationKinds.length} available
            transformations.
          </p>
          <p className={shared.definitionMeta}>
            <code>{selectedFlow.id}</code>
            <code>{selectedFlow.role}</code>
          </p>
        </div>
      )}
      <div className={shared.actionBar}>
        <fieldset className={shared.primaryActions}>
          <legend className={shared.visuallyHidden}>Suggestion actions</legend>
          <button
            className={shared.primaryButton}
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
        <p aria-live="polite" className={shared.requestStatus} role="status">
          {requestMessage}
        </p>
      </div>
    </section>
  );
}
