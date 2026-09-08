import type { InlineContent, ResourceNode } from "@oaknational/resource-document";

function inlineText(content: InlineContent | undefined): string {
  return (content ?? [])
    .map((run) => (run.type === "text" ? run.text : run.value))
    .join(" ");
}

function firstDescription(nodes: readonly ResourceNode[]): string | undefined {
  for (const node of nodes) {
    const description = resourceNodeLabel(node).trim();

    if (description !== "") {
      return description;
    }
  }

  return undefined;
}

export function resourceNodeLabel(node: ResourceNode): string {
  switch (node.type) {
    case "heading":
    case "paragraph":
    case "callout":
      return inlineText(node.content);
    case "question": {
      const content = firstDescription(node.children);
      // Labels feed a target picker, so an unlabelled and empty question still
      // has to be told apart from its siblings.
      let label = "Question";
      if (node.label !== undefined) {
        label = `Question ${node.label}`;
      } else if (content === undefined) {
        label = `Question ${node.id}`;
      }

      return content === undefined ? label : `${label}: ${content}`;
    }
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
    case "responseSpace": {
      const lines = node.lines === undefined ? "" : `, ${node.lines} lines`;
      return `${node.kind}${lines}`;
    }
    case "table":
      return node.role === "table" ? "table" : `${node.role} table`;
    case "codeBlock":
      return `${node.language ?? "code"} block`;
    case "figure":
      return inlineText(node.caption) || `Asset ${node.assetId}`;
    case "unsupported":
      return node.accessibleText ?? node.description;
    case "section":
      return `${node.children.length} child nodes`;
  }
}
