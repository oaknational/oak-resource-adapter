import { walkResourceDocument } from "@oaknational/resource-document";

import { resourceNodeLabel } from "./resource-node-label";
import styles from "../../page.module.css";
import type { ResourceDocument } from "@oaknational/resource-document";

function nodeMap(document: ResourceDocument): Map<string, string> {
  return new Map(
    Array.from(walkResourceDocument(document), (node) => [
      node.id,
      JSON.stringify(node),
    ]),
  );
}

export function ResourceDocumentInspector({
  compareWith,
  document,
  label,
  missingChange = "added",
}: Readonly<{
  compareWith?: ResourceDocument | undefined;
  document: ResourceDocument;
  label: string;
  missingChange?: "added" | "removed" | undefined;
}>) {
  const comparison = compareWith === undefined ? new Map() : nodeMap(compareWith);

  return (
    <section aria-label={label} className={styles.documentInspector}>
      <h3>{label}</h3>
      <ol>
        {Array.from(walkResourceDocument(document), (node) => {
          const previous = comparison.get(node.id);
          const change =
            compareWith === undefined
              ? "unchanged"
              : previous === undefined
                ? missingChange
                : previous === JSON.stringify(node)
                  ? "unchanged"
                  : "changed";

          return (
            <li className={styles[change]} key={node.id}>
              <span>
                <strong>{node.type}</strong> <code>{node.id}</code>
              </span>
              <p>{resourceNodeLabel(node)}</p>
              {change !== "unchanged" && <small>{change}</small>}
            </li>
          );
        })}
      </ol>
      <details className={styles.markupDetails}>
        <summary>Raw document JSON</summary>
        <pre tabIndex={0}>
          <code>{JSON.stringify(document, null, 2)}</code>
        </pre>
      </details>
    </section>
  );
}
