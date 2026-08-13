import type { ResourceDocument, ResourceNode } from "./schema/current.js";

export type ResourceDocumentInvariantCode =
  | "bounding_box_out_of_bounds"
  | "dangling_answer_target"
  | "dangling_asset_reference"
  | "dangling_diagnostic_node"
  | "dangling_source_reference"
  | "duplicate_id"
  | "invalid_response_space"
  | "nested_question";

export interface ResourceDocumentInvariantIssue {
  code: ResourceDocumentInvariantCode;
  message: string;
  path: ReadonlyArray<string | number>;
}

interface NodeVisit {
  node: ResourceNode;
  path: Array<string | number>;
  insideQuestion: boolean;
}

function visitNodes(
  nodes: readonly ResourceNode[],
  basePath: Array<string | number>,
  insideQuestion: boolean,
  visit: (entry: NodeVisit) => void,
): void {
  nodes.forEach((node, index) => {
    const path = [...basePath, index];
    visit({ node, path, insideQuestion });

    if (node.type === "section" || node.type === "question") {
      visitNodes(
        node.children,
        [...path, "children"],
        insideQuestion || node.type === "question",
        visit,
      );
    }
  });
}

/** Validates relationships and profile rules that JSON Schema cannot express. */
export function validateResourceDocumentInvariants(
  document: ResourceDocument,
): ResourceDocumentInvariantIssue[] {
  const issues: ResourceDocumentInvariantIssue[] = [];
  const identifiers = new Map<string, ReadonlyArray<string | number>>();
  const nodeIds = new Set<string>();
  const pupilNodeIds = new Set<string>();
  const assetIds = new Set(document.assets.map((asset) => asset.id));

  const registerIdentifier = (id: string, path: Array<string | number>): void => {
    const previousPath = identifiers.get(id);
    if (previousPath) {
      issues.push({
        code: "duplicate_id",
        message: `Identifier ${JSON.stringify(id)} is already used at ${previousPath.join(".")}.`,
        path,
      });
      return;
    }

    identifiers.set(id, path);
  };

  for (const asset of document.assets) {
    registerIdentifier(asset.id, ["assets", document.assets.indexOf(asset), "id"]);

    if (asset.sourceRef && !document.sourceMap?.[asset.sourceRef]) {
      issues.push({
        code: "dangling_source_reference",
        message: `Asset ${JSON.stringify(asset.id)} refers to missing source region ${JSON.stringify(asset.sourceRef)}.`,
        path: ["assets", document.assets.indexOf(asset), "sourceRef"],
      });
    }
  }

  const inspectNode = ({ node, path, insideQuestion }: NodeVisit): void => {
    registerIdentifier(node.id, [...path, "id"]);
    nodeIds.add(node.id);

    if (node.sourceRef && !document.sourceMap?.[node.sourceRef]) {
      issues.push({
        code: "dangling_source_reference",
        message: `Node ${JSON.stringify(node.id)} refers to missing source region ${JSON.stringify(node.sourceRef)}.`,
        path: [...path, "sourceRef"],
      });
    }

    if (node.type === "figure" && !assetIds.has(node.assetId)) {
      issues.push({
        code: "dangling_asset_reference",
        message: `Figure ${JSON.stringify(node.id)} refers to missing asset ${JSON.stringify(node.assetId)}.`,
        path: [...path, "assetId"],
      });
    }

    if (node.type === "question") {
      if (insideQuestion) {
        issues.push({
          code: "nested_question",
          message: `Question ${JSON.stringify(node.id)} cannot be nested inside another question in schema 0.1.`,
          path,
        });
      }
    }

    if (
      node.type === "responseSpace" &&
      ((node.kind === "lines" && node.lines === undefined) ||
        (node.kind !== "lines" && node.lines !== undefined))
    ) {
      issues.push({
        code: "invalid_response_space",
        message:
          node.kind === "lines"
            ? "A lines response space must declare its number of lines."
            : `A ${node.kind} response space must not declare a line count.`,
        path,
      });
    }
  };

  visitNodes(document.content, ["content"], false, (entry) => {
    inspectNode(entry);
    pupilNodeIds.add(entry.node.id);
  });

  document.answers.forEach((answer, answerIndex) => {
    const answerPath: Array<string | number> = ["answers", answerIndex];
    registerIdentifier(answer.id, [...answerPath, "id"]);

    if (answer.sourceRef && !document.sourceMap?.[answer.sourceRef]) {
      issues.push({
        code: "dangling_source_reference",
        message: `Answer ${JSON.stringify(answer.id)} refers to missing source region ${JSON.stringify(answer.sourceRef)}.`,
        path: [...answerPath, "sourceRef"],
      });
    }

    visitNodes(answer.content, [...answerPath, "content"], false, inspectNode);
  });

  for (const answer of document.answers) {
    if (!pupilNodeIds.has(answer.targetId)) {
      issues.push({
        code: "dangling_answer_target",
        message: `Answer ${JSON.stringify(answer.id)} targets missing node ${JSON.stringify(answer.targetId)}.`,
        path: ["answers", document.answers.indexOf(answer), "targetId"],
      });
    }
  }

  document.diagnostics.forEach((diagnostic, diagnosticIndex) => {
    if (diagnostic.nodeId && !nodeIds.has(diagnostic.nodeId)) {
      issues.push({
        code: "dangling_diagnostic_node",
        message: `Diagnostic targets missing node ${JSON.stringify(diagnostic.nodeId)}.`,
        path: ["diagnostics", diagnosticIndex, "nodeId"],
      });
    }

    if (diagnostic.sourceRef && !document.sourceMap?.[diagnostic.sourceRef]) {
      issues.push({
        code: "dangling_source_reference",
        message: `Diagnostic refers to missing source region ${JSON.stringify(diagnostic.sourceRef)}.`,
        path: ["diagnostics", diagnosticIndex, "sourceRef"],
      });
    }
  });

  if (document.sourceMap) {
    Object.entries(document.sourceMap).forEach(([sourceRef, region]) => {
      if (
        region.boundingBox.x + region.boundingBox.width > 1 ||
        region.boundingBox.y + region.boundingBox.height > 1
      ) {
        issues.push({
          code: "bounding_box_out_of_bounds",
          message: `Source region ${JSON.stringify(sourceRef)} extends beyond its normalized page bounds.`,
          path: ["sourceMap", sourceRef, "boundingBox"],
        });
      }
    });
  }

  return issues;
}
