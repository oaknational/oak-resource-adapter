import Link from "next/link";

import styles from "../page.module.css";

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
  return (
    <nav aria-label={label} className={styles.scenarioNavigation}>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Link
              aria-current={item.id === selectedId ? "page" : undefined}
              href={hrefFor(item.id)}
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
