import {
  definePreparedContribution,
  type TransformationContribution,
} from "../../contributions/contribution";
import {
  applyDefinitionList,
  definedTermsSchemaOf,
} from "../../contributions/definition-list";

const LEAD = "Helpful vocabulary";

/** Three words is the scaffold's own limit: beyond it the task has become a reading task. */
const MAX_WORDS = 3;

export const taskVocabularyContribution: TransformationContribution = {
  prepare: (context) =>
    definePreparedContribution({
      name: "task_vocabulary",
      schema: definedTermsSchemaOf(MAX_WORDS),
      apply: (output) => applyDefinitionList(context, LEAD, output.entries),
    }),
};
