import Link from "next/link";

import styles from "../page.module.css";
import type { LessonScenarioNavigationItem } from "../scenario-types";

export function ScenarioNavigation({
  scenarios,
  selectedId,
}: Readonly<{
  scenarios: readonly LessonScenarioNavigationItem[];
  selectedId: string;
}>) {
  return (
    <nav aria-label="Lesson scenarios" className={styles.scenarioNavigation}>
      <ul>
        {scenarios.map((scenario) => (
          <li key={scenario.id}>
            <Link
              aria-current={scenario.id === selectedId ? "page" : undefined}
              href={`/?lesson=${scenario.id}`}
            >
              <span>{scenario.title}</span>
              <small>
                {scenario.keyStage} · {scenario.subject}
              </small>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
