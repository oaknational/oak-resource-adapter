import { subjectRule } from "../../../rules/subject";
import { defineTransformation } from "../../define-transformation";
import { MFL_SUBJECT_SLUGS } from "../../../rules/subject-groups";
import { APPLIED_ONCE_PER_TARGET_RULE } from "../../rules/common-rules";
import { taskGlossaryContribution } from "./contribution";
import { addTaskGlossaryPrompt } from "./prompt";

export const addTaskGlossaryTransformation = defineTransformation({
  kind: "scaffold-add-task-glossary",
  label: "Add a task glossary",
  status: "active",
  suggestion: {
    description:
      "Defines the words in one task's wording that a pupil must understand before they can start.",
    useWhen:
      "Offer this for most tasks. The task instruction or question contains vocabulary a pupil needs to understand so that they can attempt the task, including vocabulary in the headings of a table the pupil fills in. That can be a lesson keyword, a subject-specific term, an instruction word with a subject meaning (such as hypothesis, annotate or source), or a word naming what the pupil works with or produces (such as a timeline, a bar chart or a sonnet). Judge this against the age of the pupils: younger pupils need more of a task's words explained. Offer this alongside any scaffold that supports writing the response.",
    avoidWhen:
      "The instruction or question contains no lesson keywords, subject-specific terms, instruction words with a subject meaning or other words a pupil needs to understand to start (a short everyday instruction such as complete, fill in or calculate does not count on its own); knowing the meaning of the word is what the task assesses; or defining the word would give away the answer.",
  },
  barriers: ["gaps-in-knowledge", "working-memory"],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.slides", required: false },
    { key: "lesson.keywords", required: false },
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.transcriptSummary", required: false },
  ],
  outputs: ["revised-resource"],
  rules: [
    APPLIED_ONCE_PER_TARGET_RULE,
    subjectRule(
      {
        id: "mfl",
        label: "Isn't a modern foreign languages lesson",
        condition: "The lesson is in one of these subjects",
      },
      { subjectSlugs: MFL_SUBJECT_SLUGS },
    ),
  ],
  execution: {
    strategy: "model",
    prompt: addTaskGlossaryPrompt,
    contribution: taskGlossaryContribution,
  },
});
