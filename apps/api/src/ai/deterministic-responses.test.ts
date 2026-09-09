import {
  createDeterministicModelTransport,
  createModelInvoker,
  renderPromptTemplate,
  type InvocationRecorder,
} from "@oaknational/resource-adapter-ai";
import {
  loadOriginalResourceDocumentFixture,
  originalResourceDocumentFixtureManifest,
} from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import {
  CONTRIBUTION_EXTENSION_KEY,
  getResourceNodesByType,
  walkResourceDocument,
  type ResourceDocument,
} from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { OakMaterial } from "../oak-material/material";
import { createTranscriptSummariser } from "../oak-material/transcript-summary";
import {
  renderChecksForUnderstanding,
  renderLearningCycleTitles,
  renderPracticeTasksWithFeedback,
  renderTranscriptSummary,
} from "../oak-material/transcript-summary/render";
import { transcriptSummarySchema } from "../oak-material/transcript-summary/schema";
import { worksheetScaffoldingSuggestionFlow as flow } from "../suggestions/definitions/worksheet-scaffolding";
import { generateSuggestions, prepareSuggestionFlow } from "../suggestions/service";
import { dismissTransformationsAt } from "../transformations/dismissal";
import { executeTransformation, type PreparePrompt } from "../transformations/execute";
import { transformationDefinitions } from "../transformations/registry";
import { definedTermsSchema } from "../transformations/contributions/definition-list";
import { resolveDeterministicResponse } from "./deterministic-responses";
import { rebindModelRoles } from "./model-roles";

const prepare: PreparePrompt = async ({ template, variables }) => ({
  promptTemplateId: `test-${template.identifier}`,
  text: renderPromptTemplate(template, variables),
});

const keyLearningPoints =
  "First person presents a character's own thoughts and feelings.";
const material: OakMaterial = {
  "lesson.keyLearningPoints": {
    kind: "text",
    text: keyLearningPoints,
  },
};

const documents = new Map<string, ResourceDocument>();

beforeAll(async () => {
  await Promise.all(
    originalResourceDocumentFixtureManifest.map(async ({ id }) => {
      const { expectedDocument } = await loadOriginalResourceDocumentFixture(id);
      documents.set(id, expectedDocument);
    }),
  );
});

function documentFor(id = "adopting-different-perspectives"): ResourceDocument {
  const document = documents.get(id);
  if (document === undefined) throw new Error(`Missing fixture ${id}`);
  return document;
}

function setup() {
  const recorder = {
    recordStarted: vi.fn<InvocationRecorder["recordStarted"]>(),
    recordSucceeded: vi.fn<InvocationRecorder["recordSucceeded"]>(),
    recordFailed: vi.fn<InvocationRecorder["recordFailed"]>(),
  };
  const invoker = createModelInvoker({
    roleBindings: rebindModelRoles("deterministic"),
    recorder,
    transports: {
      deterministic: createDeterministicModelTransport({
        resolve: resolveDeterministicResponse,
      }),
    },
  });
  return { createInvoker: () => invoker, recorder, prepare };
}

function expectValidRecording(
  recorder: ReturnType<typeof setup>["recorder"],
  name: string,
) {
  expect(recorder.recordStarted).toHaveBeenCalledWith(
    expect.objectContaining({
      transport: "deterministic",
      request: expect.objectContaining({
        output: expect.objectContaining({ kind: "STRUCTURED", name }),
      }),
    }),
  );
  expect(recorder.recordSucceeded).toHaveBeenCalledWith(
    expect.objectContaining({ outputValidationStatus: "VALID" }),
  );
  expect(recorder.recordFailed).not.toHaveBeenCalled();
}

function contributedDocument(
  run: Awaited<ReturnType<typeof executeTransformation>>,
  contributionId: string,
  kind: string,
) {
  expect(run.outcome).toBe("APPLIED");
  if (run.outcome !== "APPLIED") throw new Error(`Unexpected ${run.outcome}`);
  expect(run.outputs).toHaveLength(1);
  expect(run.outputs[0].purpose).toBe("revised-resource");
  const document = run.outputs[0].document;
  expect(parseResourceDocument(document)).toEqual(document);
  const added = [...walkResourceDocument(document)].filter(
    (node) => node.extensions?.[CONTRIBUTION_EXTENSION_KEY] === contributionId,
  );
  expect(added.length).toBeGreaterThan(0);
  for (const node of added) {
    expect(node.extensions?.["oak:transformation-kind"]).toBe(kind);
  }
  return document;
}

describe("deterministic suggestion catalogue", () => {
  it.each(originalResourceDocumentFixtureManifest)(
    "validates stable concurrent suggestions for $id",
    async ({ id }) => {
      const document = documentFor(id);
      const config = setup();
      const { candidates, preparedPrompt } = await prepareSuggestionFlow(
        flow,
        document,
        [],
        prepare,
      );
      expect(candidates.length).toBeGreaterThan(0);
      const [first, second] = await Promise.all([
        generateSuggestions(flow, document, [], config),
        generateSuggestions(flow, document, [], config),
      ]);
      expect(first).toEqual(second);
      expect(first.map(({ kind, targetBlockId }) => ({ kind, targetBlockId }))).toEqual(
        candidates.slice(0, flow.maxSuggestions).map(({ kind, eligibleTargets }) => ({
          kind,
          targetBlockId:
            eligibleTargets.scope === "document" ? null : eligibleTargets.blockIds[0],
        })),
      );
      expectValidRecording(config.recorder, "transformation_suggestions");
      expect(config.recorder.recordStarted).toHaveBeenCalledTimes(2);
      const records = config.recorder.recordSucceeded.mock.calls.map(
        ([record]) => record,
      );
      expect(records[0]?.invocationId).not.toBe(records[1]?.invocationId);
      expect(records[0]?.request).toEqual(records[1]?.request);
      expect(records[0]?.response).toEqual(records[1]?.response);
      expect(records[0]?.request).toMatchObject({
        request: { input: preparedPrompt.text },
      });
      for (const record of records) expect(record.outputValidationStatus).toBe("VALID");
    },
  );

  it.each(["applied", "dismissed"] as const)(
    "chooses remaining eligible targets after a target is %s",
    async (state) => {
      const source = documentFor();
      const [first, second] = getResourceNodesByType(source, "question");
      if (!first || !second) throw new Error("The fixture needs two questions");
      const document =
        state === "dismissed" ? dismissTransformationsAt(source, first.id) : source;
      const applied =
        state === "applied"
          ? [
              {
                kind: "scaffold-add-word-bank",
                params: { supportLevel: "low" },
                targetBlockId: first.id,
              },
            ]
          : [];
      const config = setup();
      const { candidates } = await prepareSuggestionFlow(
        flow,
        document,
        applied,
        prepare,
      );
      const wordBank = candidates.find(({ kind }) => kind === "scaffold-add-word-bank");
      expect(wordBank?.eligibleTargets).toMatchObject({
        scope: "node",
        blockIds: expect.not.arrayContaining([first.id]),
      });
      const suggestions = await generateSuggestions(flow, document, applied, config);
      expect(
        suggestions.find(({ kind }) => kind === "scaffold-add-word-bank")
          ?.targetBlockId,
      ).toBe(second.id);
      if (state === "dismissed")
        expect(suggestions.map(({ targetBlockId }) => targetBlockId)).not.toContain(
          first.id,
        );
      expectValidRecording(config.recorder, "transformation_suggestions");
    },
  );

  it.each([
    { kind: "scaffold-add-prompt-questions", targets: 0 },
    { kind: "scaffold-add-word-bank", targets: 1 },
    { kind: "scaffold-add-word-bank", targets: 2 },
  ] as const)(
    "supports a single $kind candidate with $targets node targets",
    async ({ kind, targets }) => {
      const source = documentFor();
      const questions = getResourceNodesByType(source, "question").slice(0, targets);
      expect(questions).toHaveLength(targets);
      const document = { ...source, content: questions };
      const singleKind = { ...flow, transformationKinds: [kind] };
      const config = setup();
      const { candidates } = await prepareSuggestionFlow(
        singleKind,
        document,
        [],
        prepare,
      );
      expect(candidates).toHaveLength(1);
      await expect(
        generateSuggestions(singleKind, document, [], config),
      ).resolves.toMatchObject([
        { kind, targetBlockId: targets === 0 ? null : questions[0]?.id },
      ]);
      expectValidRecording(config.recorder, "transformation_suggestions");
    },
  );

  it("honours a single const target and the schema's suggestion limit", async () => {
    const config = setup();
    const candidate = (kind: string, target: z.ZodType) =>
      z.strictObject({
        kind: z.literal(kind),
        params: z.strictObject({ supportLevel: z.literal("low") }),
        reason: z.string().min(1).max(240),
        targetBlockId: target,
      });
    const result = await config.createInvoker().invokeStructured({
      role: "worksheet-scaffolding-suggester",
      request: { input: "Suggest one change" },
      schemaName: "transformation_suggestions",
      schema: z.strictObject({
        suggestions: z
          .array(
            z.union([
              candidate("scaffold-add-word-bank", z.literal("only-target")),
              candidate("scaffold-add-prompt-questions", z.null()),
            ]),
          )
          .max(1),
      }),
    });
    expect(result).toMatchObject({
      outcome: "SUCCESS",
      output: {
        suggestions: [{ kind: "scaffold-add-word-bank", targetBlockId: "only-target" }],
      },
    });
    expectValidRecording(config.recorder, "transformation_suggestions");
  });

  it("skips invocation when all document and question targets are already applied", async () => {
    const document = documentFor();
    const applied = [
      { kind: "scaffold-add-prompt-questions", params: { supportLevel: "low" } },
      ...getResourceNodesByType(document, "question").flatMap(({ id }) =>
        ["scaffold-add-word-bank", "scaffold-chunk-tasks"].map((kind) => ({
          kind,
          params: { supportLevel: "low" },
          targetBlockId: id,
        })),
      ),
    ];
    const config = setup();
    expect(
      (await prepareSuggestionFlow(flow, document, applied, prepare)).candidates,
    ).toEqual([]);
    await expect(generateSuggestions(flow, document, applied, config)).resolves.toEqual(
      [],
    );
    expect(config.recorder.recordStarted).not.toHaveBeenCalled();
    expect(config.recorder.recordSucceeded).not.toHaveBeenCalled();
  });

  it.each([
    { role: "dev-smoke", name: "word_bank_low", schema: definedTermsSchema },
    {
      role: "worksheet-scaffold",
      name: "unknown_contract",
      schema: definedTermsSchema,
    },
    {
      role: "worksheet-scaffolding-suggester",
      name: "word_bank_low",
      schema: definedTermsSchema,
    },
    {
      role: "worksheet-scaffolding-suggester",
      name: "transformation_suggestions",
      schema: z.strictObject({ suggestions: z.array(z.string()).max(5) }),
    },
    {
      role: "worksheet-scaffolding-suggester",
      name: "transformation_suggestions",
      schema: z.strictObject({
        suggestions: z
          .array(
            z.strictObject({
              kind: z.literal("unknown-kind"),
              targetBlockId: z.null(),
            }),
          )
          .max(5),
      }),
    },
  ] as const)(
    "fails closed for unsupported $role / $name",
    async ({ role, name, schema }) => {
      const { createInvoker, recorder } = setup();
      const invoker = createInvoker();
      await expect(
        invoker.invokeStructured({
          role,
          request: { input: "Unsupported contract" },
          schemaName: name,
          schema,
        }),
      ).rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
      expect(recorder.recordStarted).not.toHaveBeenCalled();
      expect(recorder.recordSucceeded).not.toHaveBeenCalled();
    },
  );

  it("rejects text and provider-default output instead of supplying a fallback", async () => {
    const { createInvoker, recorder } = setup();
    const invoker = createInvoker();
    const invocation = {
      role: "worksheet-scaffold",
      request: { input: "Unsupported output" },
    } as const;
    await expect(invoker.invokeText(invocation)).rejects.toMatchObject({
      code: "INVALID_CONFIGURATION",
    });
    await expect(invoker.invoke(invocation)).rejects.toMatchObject({
      code: "INVALID_CONFIGURATION",
    });
    expect(recorder.recordStarted).not.toHaveBeenCalled();
  });

  it("does not bypass real schema validation when a known response disagrees with its contract", async () => {
    const { createInvoker, recorder } = setup();
    const invoker = createInvoker();
    await expect(
      invoker.invokeStructured({
        role: "worksheet-scaffold",
        request: { input: "Require definitions" },
        schemaName: "word_bank_low",
        schema: definedTermsSchema,
      }),
    ).resolves.toMatchObject({
      outcome: "STRUCTURED_OUTPUT_FAILURE",
      reason: "SCHEMA_MISMATCH",
    });
    expect(recorder.recordSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ outputValidationStatus: "SCHEMA_MISMATCH" }),
    );
  });
});

describe("deterministic transformation contributions", () => {
  it.each(["low", "mid", "high"] as const)(
    "applies the real %s word-bank contract",
    async (supportLevel) => {
      const document = documentFor();
      const before = structuredClone(document);
      const [question] = getResourceNodesByType(document, "question");
      if (!question) throw new Error("The fixture needs a question");
      const config = setup();
      const kind = "scaffold-add-word-bank";
      const contributionId = `word-bank-${supportLevel}`;
      const run = await executeTransformation(
        transformationDefinitions[kind],
        {
          document,
          contributionId,
          targetBlockId: question.id,
          params: { supportLevel },
        },
        config,
      );
      const revised = contributedDocument(run, contributionId, kind);
      const bank = getResourceNodesByType(revised, "definitionList").find(
        ({ id }) => id === `${contributionId}-vocabulary`,
      );
      expect(bank?.entries).toEqual([
        {
          term: [{ type: "text", text: "compare" }],
          ...(supportLevel === "low"
            ? {}
            : {
                definition: [
                  {
                    type: "text",
                    text: "Identify what is the same and what is different.",
                  },
                ],
              }),
          ...(supportLevel !== "high"
            ? {}
            : {
                example: [
                  {
                    type: "text",
                    text: "Compare the two examples before choosing an approach.",
                  },
                ],
              }),
        },
      ]);
      expectValidRecording(config.recorder, `word_bank_${supportLevel}`);
      expect(document).toEqual(before);
    },
  );

  it.each(["ks1", "ks2", "ks3", "ks4"])(
    "applies chunk steps using the real %s schema",
    async (keyStage) => {
      const fixture = originalResourceDocumentFixtureManifest.find(
        (entry) =>
          "oakLesson" in entry && entry.oakLesson.programme.keyStageSlug === keyStage,
      );
      if (!fixture) throw new Error(`Missing ${keyStage} fixture`);
      const document = documentFor(fixture.id);
      const [question] = getResourceNodesByType(document, "question");
      if (!question) throw new Error("The fixture needs a question");
      const kind = "scaffold-chunk-tasks";
      const contributionId = `chunk-${keyStage}`;
      const config = setup();
      const run = await executeTransformation(
        transformationDefinitions[kind],
        {
          document,
          contributionId,
          targetBlockId: question.id,
          params: { supportLevel: "low" },
        },
        config,
      );
      const revised = contributedDocument(run, contributionId, kind);
      expect(
        getResourceNodesByType(revised, "section").find(
          ({ id }) => id === `${contributionId}-chunked-steps`,
        ),
      ).toMatchObject({
        children: [
          {
            content: [
              {
                type: "text",
                text: "Step 1: Read the question and identify what it asks.",
              },
            ],
          },
          {
            content: [
              {
                type: "text",
                text: "Step 2: Choose an approach using what you have learned.",
              },
            ],
          },
          {
            content: [
              {
                type: "text",
                text: "Step 3: Complete the task and check your answer.",
              },
            ],
          },
        ],
      });
      expectValidRecording(
        config.recorder,
        ["ks1", "ks2"].includes(keyStage) ? "chunk_tasks_2_3" : "chunk_tasks_3_5",
      );
    },
  );

  it("requires Oak learning material and applies attributed recall questions at the start of the body", async () => {
    const document = documentFor();
    const kind = "scaffold-add-prompt-questions";
    const config = setup();
    const request = {
      document,
      contributionId: "recall",
      params: { supportLevel: "low" },
    };
    await expect(
      executeTransformation(transformationDefinitions[kind], request, config),
    ).rejects.toThrow(
      "scaffold-add-prompt-questions needs lesson material it was not given: lesson.keyLearningPoints.",
    );
    expect(config.recorder.recordStarted).not.toHaveBeenCalled();
    const run = await executeTransformation(
      transformationDefinitions[kind],
      { ...request, material },
      config,
    );
    const revised = contributedDocument(run, "recall", kind);
    expect(revised.content[0]).toEqual(document.content[0]);
    expect(revised.content[1]).toMatchObject({
      id: "recall-prompt-questions",
      type: "section",
      children: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Look back at the lesson so far and consider these questions:",
            },
          ],
        },
        {
          type: "question",
          children: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "What do you remember from the lesson that could help you begin?",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(revised.content.slice(2)).toEqual(document.content.slice(1));
    expect(config.recorder.recordStarted.mock.calls[0]?.[0].request).toMatchObject({
      request: { input: expect.stringContaining(keyLearningPoints) },
    });
    expectValidRecording(config.recorder, "prompt_questions");
  });
});

describe("deterministic transcript summary", () => {
  async function summarise() {
    const config = setup();
    const summary = await createTranscriptSummariser(config.createInvoker())(
      "Teacher: today we are comparing two approaches to the same question.",
    );
    if (summary === undefined) throw new Error("The summariser returned nothing");
    return { config, summary };
  }

  it("satisfies the real transcript summary contract", async () => {
    const { config, summary } = await summarise();

    expect(transcriptSummarySchema.parse(summary)).toEqual(summary);
    expectValidRecording(config.recorder, "lesson-transcript-summary");
  });

  // A summary that parses can still render nothing, leaving a browser test
  // asserting against empty material. Every part renders the cycle heading.
  it.each([
    renderTranscriptSummary,
    renderLearningCycleTitles,
    renderPracticeTasksWithFeedback,
    renderChecksForUnderstanding,
  ])("renders a populated learning cycle through %o", async (render) => {
    const { summary } = await summarise();

    expect(render(summary)).toContain("Cycle 1: ");
  });
});
