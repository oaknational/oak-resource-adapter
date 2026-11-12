import { statusBadgeClass } from "../shared/status-badge";
import type { RuleFlowModel } from "./rule-flow-model";
import { RuleRows } from "./RuleRows";
import { DisplayValues, NothingEnforced } from "./RuleValues";
import styles from "./RulesView.module.css";

export function ScaffoldCard({
  scaffold: { kind, label, rules, settings },
}: Readonly<{ scaffold: RuleFlowModel["scaffolds"][number] }>) {
  return (
    <section aria-labelledby={`scaffold-${kind}`} className={styles.scaffold}>
      <div className={styles.scaffoldHeader}>
        <span className={styles.scaffoldKicker}>Scaffold</span>
        <h3 id={`scaffold-${kind}`}>{label}</h3>
      </div>
      <div className={styles.scaffoldBody}>
        {settings.map((setting) => (
          <DisplayValues
            items={setting.values}
            key={setting.label}
            label={setting.label}
          />
        ))}
        {rules.length === 0 ? (
          <NothingEnforced>No extra rules</NothingEnforced>
        ) : (
          <RuleRows rows={rules} scaffold={label} />
        )}
      </div>
    </section>
  );
}

export function UnavailableScaffolds({
  scaffolds,
}: Readonly<{ scaffolds: RuleFlowModel["notOfferedScaffolds"] }>) {
  return (
    <section aria-labelledby="scaffolds-not-offered" className={styles.notOffered}>
      <h3 id="scaffolds-not-offered">Currently unavailable scaffolds</h3>
      <ul className={styles.unavailableList}>
        {scaffolds.map(({ kind, label, rules, status }) => (
          <li className={styles.unavailableScaffold} key={kind}>
            <span>
              <span className={styles.scaffoldKicker}>Scaffold</span>
              <span className={styles.unavailableName}>{label}</span>
            </span>
            <span className={statusBadgeClass(status)}>{status}</span>
            {rules.length > 0 && (
              <details className={`${styles.details} ${styles.unavailableRules}`}>
                <summary>Rules</summary>
                <RuleRows rows={rules} scaffold={label} />
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
