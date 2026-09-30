import { z } from "zod";

import type { InlineContent, ResourceNode } from "@oaknational/resource-document";

import type { TransformationDocuments } from "../types";
import { contributionExtensions, type ContributionContext } from "./contribution";
import { insertBeneath } from "./place";

const lineSchema = z.string().trim().min(1).max(200);

/** Lines a pupil writes from, such as sentence starters or frames. */
export function lineListSchemaOf(maxLines: number) {
  return z.strictObject({
    lines: z.array(lineSchema).min(1).max(maxLines),
  });
}

function text(value: string): InlineContent {
  return [{ type: "text", text: value }];
}

function lineList(
  context: ContributionContext,
  lead: string,
  lines: readonly string[],
): ResourceNode {
  const extensions = contributionExtensions(context);

  return {
    id: `${context.contributionId}-lines`,
    type: "section",
    extensions,
    children: [
      {
        id: `${context.contributionId}-lines-lead`,
        type: "paragraph",
        content: text(lead),
        extensions,
      },
      ...lines.map((line, index) => ({
        id: `${context.contributionId}-line-${index + 1}`,
        type: "paragraph" as const,
        content: text(line),
        extensions,
      })),
    ],
  };
}

/**
 * Places an introduced list of lines beneath the target. Which lines, and how
 * they are introduced, is each transformation's decision; this owns the node.
 */
export function applyLineList(
  context: ContributionContext,
  lead: string,
  lines: readonly string[],
): TransformationDocuments {
  return [
    insertBeneath(
      context.document,
      lineList(context, lead, lines),
      context.targetNode?.id,
    ),
  ];
}
