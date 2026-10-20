import {
  definePreparedContribution,
  type TransformationContribution,
} from "../../contributions/contribution";
import {
  applyDefinitionList,
  definedTermsSchema,
} from "../../contributions/definition-list";

const LEAD = "Helpful vocabulary";

export const taskGlossaryContribution: TransformationContribution = {
  prepare: (context) =>
    definePreparedContribution({
      name: "task_glossary",
      schema: definedTermsSchema,
      apply: (output) => applyDefinitionList(context, LEAD, output.entries),
    }),
};
