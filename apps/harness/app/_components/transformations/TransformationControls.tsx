import { resourceNodeLabel } from "./resource-node-label";
import type { TransformationCatalogueItem } from "./transformation-api";
import type { TransformationWorkbench } from "./useTransformationWorkbench";
import styles from "../../page.module.css";

type TransformationControlsProps = Pick<
  TransformationWorkbench,
  | "canSubmit"
  | "catalogue"
  | "historyDepth"
  | "previewSelected"
  | "requestState"
  | "reset"
  | "runSelected"
  | "selected"
  | "selectedKind"
  | "selectKind"
  | "setSupportLevel"
  | "setTargetBlockId"
  | "supportLevel"
  | "targetBlockId"
  | "targetNodes"
  | "undo"
  | "unmetMaterial"
>;

function executionLabel(execution: TransformationCatalogueItem["execution"]): string {
  switch (execution) {
    case "deterministic":
      return "Deterministic";
    case "structured-model":
      return "Structured model";
    case "text-model":
      return "Text model";
  }
}

export function TransformationControls({
  canSubmit,
  catalogue,
  historyDepth,
  previewSelected,
  requestState,
  reset,
  runSelected,
  selected,
  selectedKind,
  selectKind,
  setSupportLevel,
  setTargetBlockId,
  supportLevel,
  targetBlockId,
  targetNodes,
  undo,
  unmetMaterial,
}: TransformationControlsProps) {
  const drafts = catalogue.filter(({ status }) => status === "draft");
  const active = catalogue.filter(({ status }) => status === "active");
  const selectedLevel = selected?.supportLevels?.find(
    ({ level }) => level === supportLevel,
  );
  return (
    <section aria-labelledby="transformation-controls" className={styles.controls}>
      <div className={styles.controlHeader}>
        <h2 id="transformation-controls">Transformation</h2>
        {selected !== undefined && (
          <span
            className={`${styles.statusBadge} ${
              selected.status === "active" ? styles.activeStatus : styles.draftStatus
            }`}
          >
            {selected.status}
          </span>
        )}
      </div>

      <div className={styles.controlGrid}>
        <label>
          Definition
          <select
            onChange={(event) => selectKind(event.target.value)}
            value={selectedKind}
          >
            {[
              { items: active, label: "Active", marker: "✅" },
              { items: drafts, label: "Draft", marker: "🧪" },
            ].map((group) =>
              group.items.length === 0 ? null : (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item.kind} value={item.kind}>
                      {group.marker} {item.label}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        </label>

        {selected?.supportLevels !== undefined && (
          <label>
            Support level
            <select
              onChange={(event) => setSupportLevel(event.target.value)}
              value={supportLevel}
            >
              {selected.supportLevels.map(({ level }) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            {selectedLevel !== undefined && <small>{selectedLevel.description}</small>}
          </label>
        )}

        {selected?.target.scope === "node" && (
          <label>
            Target node
            <select
              onChange={(event) => setTargetBlockId(event.target.value)}
              value={targetBlockId}
            >
              {targetNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {resourceNodeLabel(node)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {selected !== undefined && (
        <p className={styles.definitionMeta}>
          <span>{executionLabel(selected.execution)}</span>
          <code>{selected.kind}</code>
        </p>
      )}

      {unmetMaterial.length > 0 && (
        <p className={styles.errorMessage} role="status">
          {unmetMaterial
            .map(({ label, unavailableBecause }) =>
              `${label} is required but unavailable. ${unavailableBecause ?? ""}`.trim(),
            )
            .join(" ")}
        </p>
      )}

      <div className={styles.actionBar}>
        <div
          aria-label="Transformation actions"
          className={styles.primaryActions}
          role="group"
        >
          <button
            className={styles.primaryButton}
            disabled={!canSubmit || requestState !== "idle"}
            onClick={() => void runSelected()}
            type="button"
          >
            {requestState === "run" ? "Running…" : "Run transformation"}
          </button>
          <button
            disabled={!canSubmit || requestState !== "idle"}
            onClick={() => void previewSelected()}
            type="button"
          >
            {requestState === "preview" ? "Preparing…" : "Preview prompt"}
          </button>
        </div>
        <div
          aria-label="Document history"
          className={styles.historyActions}
          role="group"
        >
          <button disabled={historyDepth === 0} onClick={undo} type="button">
            Undo
          </button>
          <button onClick={reset} type="button">
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}
