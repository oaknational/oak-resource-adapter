import type { InlineContent, ResourceNode } from "@oaknational/resource-document";

function inlineText(content: InlineContent | undefined): string {
  return (content ?? [])
    .map((run) => (run.type === "text" ? run.text : run.value))
    .join(" ");
}

export function resourceNodeLabel(node: ResourceNode): string {
  switch (node.type) {
    case "heading":
    case "paragraph":
    case "callout":
      return inlineText(node.content);
    case "question":
      return node.label ?? `Question ${node.id}`;
    case "definitionList":
      return [
        inlineText(node.lead),
        ...node.entries.map(({ definition, example, term }) =>
          [
            inlineText(term),
            definition === undefined ? "" : `— ${inlineText(definition)}`,
            example === undefined ? "" : `Example: ${inlineText(example)}`,
          ]
            .filter(Boolean)
            .join(" "),
        ),
      ]
        .filter(Boolean)
        .join("\n");
    case "responseSpace":
      return `${node.kind}${node.lines === undefined ? "" : `, ${node.lines} lines`}`;
    case "figure":
      return inlineText(node.caption) || `Asset ${node.assetId}`;
    case "unsupported":
      return node.accessibleText ?? node.description;
    case "section":
      return `${node.children.length} child nodes`;
  }
}
