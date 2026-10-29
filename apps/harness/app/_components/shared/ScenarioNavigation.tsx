"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { useKeepViewAs } from "./ViewAs";
import styles from "./ScenarioNavigation.module.css";

export type ScenarioNavigationItem = Readonly<{
  id: string;
  title: string;
  detail: string;
}>;

export function ScenarioNavigation({
  hrefFor,
  items,
  label,
  selectedId,
}: Readonly<{
  hrefFor: (id: string) => string;
  items: readonly ScenarioNavigationItem[];
  label: string;
  selectedId: string;
}>) {
  const navigation = useRef<HTMLElement>(null);
  const keepViewAs = useKeepViewAs();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);

  // Scrolls the sidebar alone: scrollIntoView would move the page as well.
  useEffect(() => {
    const nav = navigation.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || nav.scrollHeight <= nav.clientHeight) {
      return;
    }
    const navBox = nav.getBoundingClientRect();
    const currentBox = current.getBoundingClientRect();
    const visibleBottom = Math.min(navBox.bottom, window.innerHeight);
    if (currentBox.top < navBox.top || currentBox.bottom > visibleBottom) {
      nav.scrollTop += currentBox.top - navBox.top - (visibleBottom - navBox.top) / 2;
    }
  }, [expanded, selectedId]);

  return (
    <nav
      aria-label={label}
      className={styles.scenarioNavigation}
      data-expanded={expanded}
      ref={navigation}
    >
      <button
        aria-controls={listId}
        aria-expanded={expanded}
        className={styles.scenarioNavigationToggle}
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        {label}
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      <ul id={listId}>
        {items.map((item) => (
          <li key={item.id}>
            <Link
              aria-current={item.id === selectedId ? "page" : undefined}
              href={keepViewAs(hrefFor(item.id))}
              onClick={() => setExpanded(false)}
            >
              <span>{item.title}</span>
              <small>{item.detail}</small>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
