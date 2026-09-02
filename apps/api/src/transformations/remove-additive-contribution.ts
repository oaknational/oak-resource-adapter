import {
  contributionIdOf,
  filterResourceNodes,
  type ResourceDocument,
} from "@oaknational/resource-document";

/** Returns a revision without nodes, answers or assets added by one contribution. */
export function removeAdditiveContribution(
  document: ResourceDocument,
  contributionId: string,
): ResourceDocument {
  const isContributed = (extensions: ResourceDocument["extensions"]) =>
    contributionIdOf(extensions) === contributionId;
  const withoutNodes = filterResourceNodes(
    document,
    (node) => !isContributed(node.extensions),
  );

  return {
    ...withoutNodes,
    answers: withoutNodes.answers.filter((answer) => !isContributed(answer.extensions)),
    assets: withoutNodes.assets.filter((asset) => !isContributed(asset.extensions)),
  };
}
