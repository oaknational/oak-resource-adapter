import type { ReactNode } from "react";

import styles from "./ScenarioLayout.module.css";
import { ScenarioNavigation } from "./ScenarioNavigation";

export function ScenarioLayout({
  children,
  ...navigation
}: Readonly<
  Parameters<typeof ScenarioNavigation>[0] & {
    children: ReactNode;
  }
>) {
  return (
    <div className={styles.scenarioLayout}>
      <ScenarioNavigation {...navigation} />
      <div className={styles.scenarioContent}>{children}</div>
    </div>
  );
}
