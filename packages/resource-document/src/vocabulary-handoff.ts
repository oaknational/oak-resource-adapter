import { resourceVocabulary } from "./vocabulary.js";

export function vocabularyHandoffTable(): string {
  const rows = Object.values(resourceVocabulary.nodes).flatMap((entry) =>
    entry.directives.map(
      (directive) =>
        `| \`${directive}\` | \`${entry.nodeType}\` | ${entry.takesChildren ? "Yes" : "No"} |`,
    ),
  );
  rows.push(
    `| \`${resourceVocabulary.annotations.answer.directive}\` | Answer annotation | ${resourceVocabulary.annotations.answer.takesChildren ? "Yes" : "No"} |`,
  );
  return [
    "| Directive | Canonical output | Child blocks |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}
