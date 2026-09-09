import type { ResourceNode } from "./schema/types.js";

type NodeVocabulary = {
  [Type in ResourceNode["type"]]: {
    nodeType: Type;
    directives: readonly string[];
    takesChildren: Extract<ResourceNode, { type: Type }> extends {
      children: ResourceNode[];
    }
      ? true
      : false;
  };
};

export const resourceVocabulary = {
  nodes: {
    section: { nodeType: "section", directives: ["oak-section"], takesChildren: true },
    heading: { nodeType: "heading", directives: ["oak-heading"], takesChildren: false },
    paragraph: {
      nodeType: "paragraph",
      directives: ["oak-paragraph"],
      takesChildren: false,
    },
    callout: {
      nodeType: "callout",
      directives: ["oak-learning-objective", "oak-instruction", "oak-callout"],
      takesChildren: false,
    },
    question: {
      nodeType: "question",
      directives: ["oak-question"],
      takesChildren: true,
    },
    definitionList: {
      nodeType: "definitionList",
      directives: [],
      takesChildren: false,
    },
    responseSpace: {
      nodeType: "responseSpace",
      directives: ["oak-answer-space"],
      takesChildren: false,
    },
    figure: { nodeType: "figure", directives: ["oak-figure"], takesChildren: false },
    table: {
      nodeType: "table",
      directives: ["oak-table", "oak-ion-table", "oak-rhythm-grid"],
      takesChildren: false,
    },
    codeBlock: {
      nodeType: "codeBlock",
      directives: ["oak-code-block"],
      takesChildren: false,
    },
    unsupported: {
      nodeType: "unsupported",
      directives: ["oak-unsupported"],
      takesChildren: false,
    },
  },
  annotations: { answer: { directive: "oak-answer", takesChildren: true } },
} as const satisfies {
  nodes: NodeVocabulary;
  annotations: { answer: { directive: string; takesChildren: boolean } };
};

export type ResourceNodeType = keyof typeof resourceVocabulary.nodes;
export type ResourceDirectiveName =
  | (typeof resourceVocabulary.nodes)[ResourceNodeType]["directives"][number]
  | typeof resourceVocabulary.annotations.answer.directive;
