import {
  applyDefinitionList,
  definedTermsSchema,
} from "../../contributions/definition-list";
import { definePreparedContribution } from "../../contributions/contribution";
import type { TransformationContribution } from "../../contributions/contribution";

const LEAD = "This vocabulary will help you unpick what the task is asking you to do:";

/** A glossary always supplies definitions, whatever the support level. */
export const glossaryContribution: TransformationContribution = {
  prepare: (context) =>
    definePreparedContribution({
      name: "question_glossary",
      schema: definedTermsSchema,
      apply: (output) => applyDefinitionList(context, LEAD, output.entries),
    }),
};
