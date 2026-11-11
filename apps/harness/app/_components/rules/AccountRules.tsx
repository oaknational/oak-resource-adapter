import type { RuleCatalogue } from "@oaknational/resource-adapter-dev-api-contracts";

import { ruleAnchor } from "./rule-flow-model";
import { ConfigList, Details, DetailsItem } from "./RuleDetails";
import styles from "./RulesView.module.css";

export function GateRows({ gates }: Readonly<{ gates: RuleCatalogue["gates"] }>) {
  return (
    <ul className={styles.rows}>
      {gates.map(({ description, id, label, status, untilMet }) => (
        <li
          className={`${styles.row} ${status === "planned" ? styles.planned : ""}`}
          id={ruleAnchor("gate", id)}
          key={id}
        >
          <p className={styles.condition}>
            {label}
            {status === "planned" && (
              <span className={styles.plannedBadge}>Planned</span>
            )}
          </p>
          <p>Until then: {untilMet}</p>
          <Details>
            <DetailsItem term="Description">{description}</DetailsItem>
          </Details>
        </li>
      ))}
    </ul>
  );
}

export function AccessPolicies({
  policies,
}: Readonly<{ policies: RuleCatalogue["access"] }>) {
  return policies.map(({ config, description, id, outcomes }) => (
    <div className={styles.row} id={ruleAnchor("access", id)} key={id}>
      <dl className={styles.outcomes}>
        {outcomes.map(({ label, result }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{result}</dd>
          </div>
        ))}
      </dl>
      <Details>
        <DetailsItem term="Description">{description}</DetailsItem>
        <DetailsItem term="Config">
          <ConfigList config={config} />
        </DetailsItem>
      </Details>
    </div>
  ));
}
