import { z } from "zod";

import type {
  InlineContent,
  ResourceDocument,
  ResourceNode,
} from "@oaknational/resource-document";

import {
  contributionExtensions,
  definePreparedContribution,
} from "../../contributions/contribution";
import { insertBeneath } from "../../contributions/place";
import type {
  ContributionContext,
  TransformationContribution,
} from "../../contributions/contribution";

type StepRange = Readonly<{ maximum: number; minimum: number }>;

const stepSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .transform((step) => step.replace(/^(?:step\s+)?\d+[.):]\s*/i, ""))
  .pipe(z.string().trim().min(1).max(200));

function stepRange(document: ResourceDocument): StepRange | undefined {
  const { metadata } = document;
  const keyStage =
    "keyStage" in metadata ? metadata.keyStage?.id.toLowerCase() : undefined;

  switch (keyStage) {
    case "ks1":
    case "ks2":
      return { maximum: 3, minimum: 2 };
    case "ks3":
    case "ks4":
      return { maximum: 5, minimum: 3 };
    default:
      return undefined;
  }
}

export function supportsChunkingKeyStage(document: ResourceDocument): boolean {
  return stepRange(document) !== undefined;
}

function text(value: string): InlineContent {
  return [{ type: "text", text: value }];
}

function chunkedSteps(
  context: ContributionContext,
  steps: readonly string[],
): ResourceNode {
  const extensions = contributionExtensions(context);

  return {
    id: `${context.contributionId}-chunked-steps`,
    type: "section",
    extensions,
    children: steps.map((step, index) => {
      const number = index + 1;

      return {
        id: `${context.contributionId}-chunked-step-${number}`,
        type: "paragraph" as const,
        content: text(`Step ${number}: ${step}`),
        extensions,
      };
    }),
  };
}

export const chunkTasksContribution: TransformationContribution = {
  prepare: (context) => {
    const range = stepRange(context.document);

    if (range === undefined) {
      throw new Error(
        `${context.transformationKind} needs a resource for key stage 1 to 4.`,
      );
    }

    const schema = z.strictObject({
      steps: z.array(stepSchema).min(range.minimum).max(range.maximum),
    });

    return definePreparedContribution({
      name: `chunk_tasks_${range.minimum}_${range.maximum}`,
      schema,
      apply: (output) => [
        insertBeneath(
          context.document,
          chunkedSteps(context, output.steps),
          context.targetNode?.id,
        ),
      ],
    });
  },
};
