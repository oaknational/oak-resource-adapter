import {
  definePreparedContribution,
  type TransformationContribution,
} from "../../contributions/contribution";
import { applyLineList, lineListSchemaOf } from "../../contributions/line-list";

const LEAD = "You could shape your answer like this:";

export const sentenceFramesContribution: TransformationContribution = {
  prepare: (context) =>
    definePreparedContribution({
      name: "sentence_frames",
      schema: lineListSchemaOf(4),
      apply: (output) => applyLineList(context, LEAD, output.lines),
    }),
};
