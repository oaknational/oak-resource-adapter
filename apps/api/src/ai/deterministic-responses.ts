import {
  ModelInvocationError,
  type DeterministicModelResponseResolver,
  type JsonValue,
} from "@oaknational/resource-adapter-ai";
import { z } from "zod";

const offers = {
  "scaffold-add-word-bank": {
    params: { supportLevel: "low" },
    reason: "Use a short vocabulary list to support the question.",
  },
  "scaffold-add-prompt-questions": {
    params: { supportLevel: "low" },
    reason: "Recall earlier learning before starting the worksheet.",
  },
  "scaffold-chunk-tasks": {
    params: { supportLevel: "low" },
    reason: "Work through the task one step at a time.",
  },
} as const;

const vocabulary = {
  term: "compare",
  definition: "Identify what is the same and what is different.",
  example: "Compare the two examples before choosing an approach.",
};
const steps = [
  "Read the question and identify what it asks.",
  "Choose an approach using what you have learned.",
  "Complete the task and check your answer.",
];

const scaffoldResponses: Readonly<Record<string, JsonValue>> = {
  word_bank_low: { entries: [{ term: vocabulary.term }] },
  word_bank_mid: {
    entries: [{ term: vocabulary.term, definition: vocabulary.definition }],
  },
  word_bank_high: { entries: [vocabulary] },
  prompt_questions: {
    questions: ["What do you remember from the lesson that could help you begin?"],
  },
  chunk_tasks_2_3: { steps },
  chunk_tasks_3_5: { steps },
};

/** One populated cycle, so every transcript summary material part renders content. */
const transcriptSummary: JsonValue = {
  learningCycles: [
    {
      title: "Comparing two approaches",
      cycleOutcome:
        "Pupils can compare two approaches and say which one suits the question.",
      explanation: [
        `To ${vocabulary.term} is to ${vocabulary.definition.toLowerCase()}`,
        "Choosing between two approaches starts from what the question asks for.",
      ],
      checksForUnderstanding: [
        {
          question: "What do you look for when you compare two approaches?",
          expectedAnswer: vocabulary.definition,
          teacherResponse: "Both the similarities and the differences matter.",
        },
      ],
      practiceTask: steps,
      feedback: ["Check that each approach is described before it is judged."],
    },
  ],
  unassignedTranscriptContent: [
    "The lesson closed by revisiting the example from the introduction.",
  ],
};

const candidateSchema = z.object({
  properties: z.object({
    kind: z.object({ const: z.string() }),
    targetBlockId: z.union([
      z.object({ enum: z.tuple([z.string()], z.string()) }),
      z.object({ const: z.string() }),
      z.object({ type: z.literal("null") }),
    ]),
  }),
});
const suggestionContractSchema = z.object({
  properties: z.object({
    value: z.object({
      properties: z.object({
        suggestions: z.object({
          maxItems: z.number().int().positive(),
          items: z.union([
            candidateSchema,
            z.object({ anyOf: z.array(candidateSchema).nonempty() }),
          ]),
        }),
      }),
    }),
  }),
});

type TargetBlockIdSchema = z.infer<
  typeof candidateSchema
>["properties"]["targetBlockId"];

function suggestedTarget(target: TargetBlockIdSchema): string | null {
  if ("enum" in target) {
    return target.enum[0];
  }
  if ("const" in target) {
    return target.const;
  }
  return null;
}

function unsupported(contract: string): never {
  throw new ModelInvocationError({
    code: "INVALID_CONFIGURATION",
    message: `No deterministic model response for ${contract}.`,
  });
}

function suggestions(schema: z.ZodType): JsonValue {
  // Eligibility is already encoded in this schema, including dismissed targets.
  const parsed = suggestionContractSchema.safeParse(
    z.toJSONSchema(schema, { io: "input" }),
  );
  if (!parsed.success) {
    return unsupported("the transformation_suggestions schema");
  }
  const { items, maxItems } = parsed.data.properties.value.properties.suggestions;
  const candidates = "anyOf" in items ? items.anyOf : [items];
  const generated = candidates.map(({ properties }) => {
    const kind = properties.kind.const;
    if (!Object.hasOwn(offers, kind)) {
      return unsupported(`suggestion kind ${kind}`);
    }
    return {
      kind,
      ...offers[kind as keyof typeof offers],
      targetBlockId: suggestedTarget(properties.targetBlockId),
    };
  });
  return { suggestions: generated.slice(0, maxItems) };
}

export const resolveDeterministicResponse: DeterministicModelResponseResolver = (
  invocation,
  output,
) => {
  if (output.kind !== "STRUCTURED") {
    return unsupported(`${invocation.role}/${output.kind}`);
  }
  if (
    invocation.role === "worksheet-scaffolding-suggester" &&
    output.name === "transformation_suggestions"
  ) {
    return suggestions(output.schema);
  }
  if (
    invocation.role === "worksheet-scaffold" &&
    Object.hasOwn(scaffoldResponses, output.name)
  ) {
    return scaffoldResponses[output.name]!;
  }
  if (
    invocation.role === "lesson-transcript-summary" &&
    output.name === "lesson-transcript-summary"
  ) {
    return transcriptSummary;
  }
  return unsupported(`${invocation.role}/${output.name}`);
};
