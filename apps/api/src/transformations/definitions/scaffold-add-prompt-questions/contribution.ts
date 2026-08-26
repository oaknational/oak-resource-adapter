import { z } from "zod";

import type { InlineContent, ResourceNode } from "@oaknational/resource-document";

import {
  contributionExtensions,
  definePreparedContribution,
} from "../../contributions/contribution";
import { insertBeneath } from "../../contributions/place";
import type {
  ContributionContext,
  TransformationContribution,
} from "../../contributions/contribution";

const LEAD = "Look back at the lesson so far and consider these questions:";

const promptQuestionsSchema = z.strictObject({
  questions: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
});

function text(value: string): InlineContent {
  return [{ type: "text", text: value }];
}

function promptQuestions(
  context: ContributionContext,
  questions: readonly string[],
): ResourceNode {
  const extensions = contributionExtensions(context);

  return {
    id: `${context.contributionId}-prompt-questions`,
    type: "section",
    extensions,
    children: [
      {
        id: `${context.contributionId}-prompt-questions-lead`,
        type: "paragraph",
        content: text(LEAD),
        extensions,
      },
      ...questions.map((question, index) => {
        const number = index + 1;

        return {
          id: `${context.contributionId}-prompt-question-${number}`,
          type: "question" as const,
          label: String(number),
          extensions,
          children: [
            {
              id: `${context.contributionId}-prompt-question-${number}-text`,
              type: "paragraph" as const,
              content: text(question),
              extensions,
            },
          ],
        };
      }),
    ],
  };
}

export const promptQuestionsContribution: TransformationContribution = {
  prepare: (context) =>
    definePreparedContribution({
      name: "prompt_questions",
      schema: promptQuestionsSchema,
      apply: (output) => [
        insertBeneath(
          context.document,
          promptQuestions(context, output.questions),
          context.targetNode?.id,
        ),
      ],
    }),
};
