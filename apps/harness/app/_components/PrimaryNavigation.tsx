import Link from "next/link";

import styles from "../page.module.css";
import type { HarnessSection } from "../scenario-types";

export function PrimaryNavigation({
  scenarioId,
  section,
}: Readonly<{ scenarioId: string; section: HarnessSection }>) {
  return (
    <nav aria-label="Harness sections" className={styles.primaryNavigation}>
      <Link
        aria-current={section === "lessons" ? "page" : undefined}
        href={`/?lesson=${scenarioId}`}
      >
        Lesson scenarios
      </Link>
      <Link
        aria-current={section === "smoke-tests" ? "page" : undefined}
        href={`/?view=smoke-tests&lesson=${scenarioId}`}
      >
        Smoke tests
      </Link>
    </nav>
  );
}
