import type { ReactNode } from "react";

import styles from "./RulesView.module.css";

export function NothingEnforced({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className={styles.nothingEnforced}>
      <svg aria-hidden focusable={false} height={14} viewBox="0 0 16 16" width={14}>
        <path
          d="M3 8.5 6.5 12 13 4.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.25"
        />
      </svg>
      {children}
    </p>
  );
}

/** Renders the identifiers the API marks with backticks as code. */
export function WithCode({ text }: Readonly<{ text: string }>) {
  const segments: ReactNode[] = [];
  let offset = 0;
  text.split("`").forEach((part, position) => {
    segments.push(
      position % 2 === 1 ? (
        <code key={offset}>{part}</code>
      ) : (
        <span key={offset}>{part}</span>
      ),
    );
    offset += part.length + 1;
  });
  return segments;
}

export function DisplayValues({
  items,
  label,
}: Readonly<{ items: readonly string[]; label?: string | undefined }>) {
  if (items.length === 0) {
    return (
      <NothingEnforced>Nothing listed, so this doesn&apos;t apply yet</NothingEnforced>
    );
  }
  return (
    <div className={styles.displayValuesLine}>
      {label !== undefined && (
        <span className={styles.displayValuesLabel}>{label}:</span>
      )}
      <ul className={styles.displayValues}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
