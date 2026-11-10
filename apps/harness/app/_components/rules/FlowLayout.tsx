import type { ReactNode } from "react";

import styles from "./RulesView.module.css";

const dividerTones = {
  account: styles.dividerAccount,
  capability: styles.dividerCapability,
  lesson: styles.dividerLesson,
  transformation: styles.dividerTransformation,
};

type Section = Readonly<{ id: string; label: string; tone: keyof typeof dividerTones }>;

export const SECTIONS = {
  lesson: { id: "lesson-rules", label: "Lesson rules", tone: "lesson" },
  account: { id: "account-rules", label: "Account rules", tone: "account" },
  capability: { id: "capability-rules", label: "Capability rules", tone: "capability" },
  everyScaffold: {
    id: "every-transformation",
    label: "Every transformation",
    tone: "transformation",
  },
  eachScaffold: {
    id: "each-transformation",
    label: "Each transformation",
    tone: "transformation",
  },
} as const satisfies Record<string, Section>;

export function Divider({ section }: Readonly<{ section: Section }>) {
  return (
    <p className={`${styles.divider} ${dividerTones[section.tone]}`} id={section.id}>
      <span>{section.label}</span>
    </p>
  );
}

export function Box({
  children,
  number,
  question,
}: Readonly<{ children: ReactNode; number: number; question: string }>) {
  const headingId = `box-${number}`;
  return (
    <li aria-labelledby={headingId} className={styles.box}>
      <h2 className={styles.question} id={headingId}>
        <span className={styles.number}>{number}</span>
        {question}
      </h2>
      {children}
    </li>
  );
}
