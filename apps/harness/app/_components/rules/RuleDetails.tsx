import type {
  RuleConfig,
  RuleDescription,
} from "@oaknational/resource-adapter-dev-api-contracts";
import type { ReactNode } from "react";

import { configLines, readsLabels, type ConfigLine } from "./rule-details";
import styles from "./RulesView.module.css";

function ConfigLines({ lines }: Readonly<{ lines: readonly ConfigLine[] }>) {
  return (
    <dl className={styles.config}>
      {lines.map(({ key, label, value }) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>
            {value.kind === "text" && value.text}
            {value.kind === "list" &&
              (value.items.length === 0 ? "None" : value.items.join(", "))}
            {value.kind === "group" && <ConfigLines lines={value.lines} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ConfigList({ config }: Readonly<{ config: RuleConfig }>) {
  const lines = configLines(config);
  return lines.length === 0 ? "None" : <ConfigLines lines={lines} />;
}

export function Details({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <details className={styles.details}>
      <summary>Details</summary>
      <dl className={styles.detailsList}>{children}</dl>
    </details>
  );
}

export function DetailsItem({
  children,
  term,
}: Readonly<{ children: ReactNode; term: string }>) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function RuleDetails({
  rule,
  variesByScaffold,
}: Readonly<{ rule: RuleDescription; variesByScaffold: boolean }>) {
  return (
    <Details>
      <DetailsItem term="Rule">
        {rule.label} (<code>{rule.id}</code>
        {rule.kind === rule.id ? "" : `, ${rule.kind}`})
      </DetailsItem>
      {rule.description !== undefined && (
        <DetailsItem term="Description">{rule.description}</DetailsItem>
      )}
      <DetailsItem term="Reads">{readsLabels(rule).join(", ")}</DetailsItem>
      <DetailsItem term="Config">
        {variesByScaffold ? (
          "Set for each scaffold below"
        ) : (
          <ConfigList config={rule.config} />
        )}
      </DetailsItem>
    </Details>
  );
}
