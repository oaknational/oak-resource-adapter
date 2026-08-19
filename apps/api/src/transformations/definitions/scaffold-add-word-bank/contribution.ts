import {
  definePreparedContribution,
  requireSupportLevel,
} from "../../contributions/contribution";
import {
  applyDefinitionList,
  definedTermsSchema,
  exemplifiedTermsSchema,
  termsOnlySchema,
  type DefinitionListSchema,
} from "../../contributions/definition-list";
import type { TransformationContribution } from "../../contributions/contribution";
import type { SupportLevel } from "../../support-level";

const LEAD = "Vocabulary you could include:";

function schemaFor(supportLevel: SupportLevel): DefinitionListSchema {
  switch (supportLevel) {
    case "low":
      return termsOnlySchema;
    case "mid":
      return definedTermsSchema;
    case "high":
      return exemplifiedTermsSchema;
  }
}

/** The output contract follows the level a teacher chose, so it cannot overreach. */
export const wordBankContribution: TransformationContribution = {
  prepare: (context) => {
    const supportLevel = requireSupportLevel(context);
    const schema = schemaFor(supportLevel);

    return definePreparedContribution({
      name: `word_bank_${supportLevel}`,
      schema,
      apply: (output) => applyDefinitionList(context, LEAD, output.entries),
    });
  },
};
