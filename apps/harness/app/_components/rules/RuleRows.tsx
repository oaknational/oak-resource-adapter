import type { RuleCatalogue } from "@oaknational/resource-adapter-dev-api-contracts";

import { ruleAnchor, type FlowRow, type RuleOutcome } from "./rule-flow-model";
import { ConfigList, Details, DetailsItem, RuleDetails } from "./RuleDetails";
import { DisplayValues, WithCode } from "./RuleValues";
import styles from "./RulesView.module.css";

function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text)
    ? `${text.charAt(0).toLowerCase()}${text.slice(1)}`
    : text;
}

function quoted(name: string): string {
  return `“${name}”`;
}

function outcomeText(scaffold: string, { narrows, removed }: RuleOutcome): string {
  return narrows
    ? `${quoted(scaffold)} is offered, but not as ${removed.map(quoted).join(" or ")}`
    : `${quoted(scaffold)} isn't offered`;
}

/** Rows for one scaffold read as "If … Then <scaffold> …". */
export function RuleRows({
  rows,
  scaffold,
}: Readonly<{ rows: readonly FlowRow[]; scaffold?: string }>) {
  return (
    <ul className={styles.rows}>
      {rows.map(({ anchor, note, outcome, rule, variesByScaffold = false }) => (
        <li className={styles.row} id={anchor} key={anchor}>
          <p className={styles.condition}>
            {scaffold === undefined ? (
              rule.condition
            ) : (
              <>If {lowerFirst(rule.condition)}</>
            )}
          </p>
          {rule.displayValues !== undefined && !variesByScaffold && (
            <DisplayValues items={rule.displayValues} label={rule.displayValuesLabel} />
          )}
          {rule.checks !== undefined && (
            <>
              <p className={styles.checksLead}>
                Any of these
                {rule.source === undefined ? null : (
                  <>
                    , from <WithCode text={rule.source} />
                  </>
                )}
                :
              </p>
              <ul className={styles.checks}>
                {rule.checks.map((check) => (
                  <li key={check}>
                    <WithCode text={check} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {outcome !== undefined && scaffold !== undefined && (
            <p className={outcome.narrows ? styles.narrows : styles.refuses}>
              <span className={styles.keyword}>Then</span>{" "}
              {outcomeText(scaffold, outcome)}
            </p>
          )}
          {note !== undefined && <p className={styles.note}>{note}</p>}
          <RuleDetails rule={rule} variesByScaffold={variesByScaffold} />
        </li>
      ))}
    </ul>
  );
}

export function LessonMaterialRows({
  materials,
}: Readonly<{ materials: RuleCatalogue["lessonMaterials"] }>) {
  return (
    <ul className={styles.rows}>
      {materials.map(({ condition, config, description, displayValues, id, label }) => (
        <li className={styles.row} id={ruleAnchor("materials", id)} key={id}>
          <p className={styles.condition}>{condition}</p>
          <DisplayValues items={displayValues} />
          <Details>
            <DetailsItem term="Rule">
              {label} (<code>{id}</code>)
            </DetailsItem>
            {description !== undefined && (
              <DetailsItem term="Description">{description}</DetailsItem>
            )}
            <DetailsItem term="Config">
              <ConfigList config={config} />
            </DetailsItem>
          </Details>
        </li>
      ))}
    </ul>
  );
}
