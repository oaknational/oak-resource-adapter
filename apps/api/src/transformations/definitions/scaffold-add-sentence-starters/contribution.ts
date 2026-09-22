import {
  definePreparedContribution,
  type TransformationContribution,
} from "../../contributions/contribution";
import { applyLineList, lineListSchemaOf } from "../../contributions/line-list";

const LEAD = "You could begin your answer like this:";

export const sentenceStartersContribution: TransformationContribution = {
  prepare: (context) =>
    definePreparedContribution({
      name: "sentence_starters",
      schema: lineListSchemaOf(4),
      apply: (output) => applyLineList(context, LEAD, output.lines),
    }),
};
