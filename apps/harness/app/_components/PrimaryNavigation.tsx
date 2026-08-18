import Link from "next/link";

import styles from "../page.module.css";
import type { HarnessSection } from "../scenario-types";

export function PrimaryNavigation({
  lessonId,
  section,
}: Readonly<{ lessonId: string; section: HarnessSection }>) {
  return (
    <nav aria-label="Harness sections" className={styles.primaryNavigation}>
      <Link
        aria-current={section === "lessons" ? "page" : undefined}
        href={`/?lesson=${lessonId}`}
      >
        Lesson scenarios
      </Link>
      <Link
        aria-current={section === "edge-cases" ? "page" : undefined}
        href="/?view=edge-cases"
      >
        Edge cases
      </Link>
      <Link
        aria-current={section === "smoke-tests" ? "page" : undefined}
        href={`/?view=smoke-tests&lesson=${lessonId}`}
      >
        Smoke tests
      </Link>
    </nav>
  );
}
