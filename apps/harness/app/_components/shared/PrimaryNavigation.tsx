"use client";

import Link from "next/link";

import { useKeepViewAs } from "./ViewAs";
import styles from "./PrimaryNavigation.module.css";
import type { HarnessSection } from "../../scenario-types";

export function PrimaryNavigation({
  lessonId,
  section,
}: Readonly<{ lessonId: string; section: HarnessSection }>) {
  const hrefFor = useKeepViewAs();

  return (
    <nav aria-label="Harness sections" className={styles.primaryNavigation}>
      <Link
        aria-current={section === "lessons" ? "page" : undefined}
        href={hrefFor(`/?lesson=${lessonId}`)}
      >
        Try ORA
      </Link>
      <Link
        aria-current={section === "capabilities" ? "page" : undefined}
        href={hrefFor(`/?view=capabilities&lesson=${lessonId}`)}
      >
        Capabilities
      </Link>
      <Link
        aria-current={section === "transformations" ? "page" : undefined}
        href={hrefFor(`/?view=transformations&lesson=${lessonId}`)}
      >
        Transformations
      </Link>
      <Link
        aria-current={section === "suggestions" ? "page" : undefined}
        href={hrefFor(`/?view=suggestions&lesson=${lessonId}`)}
      >
        Suggestions
      </Link>
      <Link
        aria-current={section === "exports" ? "page" : undefined}
        href={hrefFor(`/?view=exports&lesson=${lessonId}`)}
      >
        Exports
      </Link>
      <Link
        aria-current={section === "edge-cases" ? "page" : undefined}
        href={hrefFor("/?view=edge-cases")}
      >
        Edge cases
      </Link>
      <Link
        aria-current={section === "smoke-tests" ? "page" : undefined}
        href={hrefFor(`/?view=smoke-tests&lesson=${lessonId}`)}
      >
        Smoke tests
      </Link>
    </nav>
  );
}
