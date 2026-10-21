import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  artifactDownloadFixtureSchema,
  docxExportRequestSchema,
  jobResponseSchema,
  modelInvocationRequestSchema,
  modelInvocationResponseSchema,
  oakMaterialRequestSchema,
  oakMaterialResponseSchema,
  storageRoundTripResponseSchema,
  suggestionCatalogueSchema,
  suggestionCommandSchema,
  suggestionPreviewSchema,
  suggestionRunResponseSchema,
  testJobRequestSchema,
  transformationCatalogueSchema,
  transformationCommandSchema,
  transformationPreviewSchema,
  transformationRunResponseSchema,
} from "./index.js";

const unknownField = { addedByANewerVersion: true };

const freeFormKeys = new Set(["document", "params"]);

/** Adds `unknownField` to every object in `value`. */
function withUnknownFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withUnknownFields);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return {
    ...Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        freeFormKeys.has(key) ? entry : withUnknownFields(entry),
      ]),
    ),
    ...unknownField,
  };
}

/** Copies of `value`, each with `unknownField` added to exactly one of its objects. */
function withOneUnknownField(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      withOneUnknownField(item).map((variant) =>
        value.map((original, position) => (position === index ? variant : original)),
      ),
    );
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return [
    { ...value, ...unknownField },
    ...Object.entries(value).flatMap(([key, entry]) =>
      freeFormKeys.has(key)
        ? []
        : withOneUnknownField(entry).map((variant) => ({ ...value, [key]: variant })),
    ),
  ];
}

const lesson = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
};

const availableTransformation = {
  barriers: ["working-memory"],
  inputs: [
    {
      id: "supportLevel",
      kind: "choice",
      label: "Support level",
      options: [{ description: "Words only.", label: "Low", value: "low" }],
    },
  ],
  kind: "scaffold-add-word-bank",
  label: "Add a word bank",
  outputs: ["revised-resource"],
  suggestion: {
    avoidWhen: "The question already supplies the vocabulary.",
    description: "Adds vocabulary for one question.",
    useWhen: "Relevant vocabulary needs recalling.",
  },
  target: { nodeTypes: ["question"], scope: "node" },
};

const suggestionFlow = {
  capabilityId: "worksheetScaffolding",
  id: "worksheet-scaffolding",
  label: "Add extra scaffolding",
  maxSuggestions: 3,
  role: "suggestion",
  transformationKinds: ["scaffold-add-word-bank"],
};

const responses: ReadonlyArray<readonly [string, z.ZodType, unknown]> = [
  [
    "transformation catalogue",
    transformationCatalogueSchema,
    {
      capabilities: [
        {
          id: "worksheetScaffolding",
          label: "Add extra scaffolding",
          resourceType: "worksheet",
          suggestionFlowId: "worksheet-scaffolding",
          transformationKinds: ["scaffold-add-word-bank"],
        },
      ],
      material: [
        {
          available: true,
          key: "lesson.keywords",
          label: "Lesson keywords",
          promptHeading: "LESSON KEYWORDS",
        },
      ],
      transformations: [
        {
          ...availableTransformation,
          execution: "structured-model",
          materialRequirements: [
            {
              available: true,
              key: "lesson.keywords",
              label: "Lesson keywords",
              required: false,
            },
          ],
          status: "retired",
        },
      ],
    },
  ],
  [
    "transformation preview",
    transformationPreviewSchema,
    {
      execution: "text-model",
      kind: "scaffold-add-word-bank",
      prompt: { identifier: "scaffold-add-word-bank", text: "Rendered" },
      status: "draft",
      warnings: [],
    },
  ],
  [
    "transformation run",
    transformationRunResponseSchema,
    {
      run: {
        meta: {
          invocationId: "invocation-1",
          providerResponseId: "response-1",
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        },
        outcome: "TEXT",
        text: "Draft output",
      },
      warnings: [],
    },
  ],
  ["suggestion catalogue", suggestionCatalogueSchema, { flows: [suggestionFlow] }],
  [
    "suggestion preview",
    suggestionPreviewSchema,
    {
      candidates: [
        {
          ...availableTransformation,
          eligibleTargets: { blockIds: ["question-1"], scope: "node" },
        },
      ],
      flow: suggestionFlow,
      prompt: { identifier: "worksheet-scaffolding", text: "Rendered" },
    },
  ],
  [
    "suggestion run",
    suggestionRunResponseSchema,
    {
      flowId: "worksheet-scaffolding",
      suggestions: [
        {
          kind: "scaffold-add-word-bank",
          label: "Add a word bank",
          params: { supportLevel: "low" },
          reason: "The question uses unfamiliar vocabulary.",
          targetBlockId: "question-1",
        },
      ],
    },
  ],
  [
    "Oak material",
    oakMaterialResponseSchema,
    {
      parts: [
        {
          key: "lesson.keywords",
          label: "Lesson keywords",
          text: "perspective",
          warning: null,
        },
      ],
    },
  ],
  [
    "job",
    jobResponseSchema,
    {
      completedAt: "2026-10-21T12:00:02.000Z",
      createdAt: "2026-10-21T12:00:00.000Z",
      failure: { code: "ECHO_FAILED", message: null },
      id: "job-1",
      kind: "test.echo",
      startedAt: "2026-10-21T12:00:01.000Z",
      status: "failed",
      updatedAt: "2026-10-21T12:00:02.000Z",
      workflowRunId: null,
    },
  ],
  [
    "storage round trip",
    storageRoundTripResponseSchema,
    {
      bucket: "artifacts",
      byteSize: 12,
      crc32c: "AAAAAA==",
      environment: "local",
      federated: false,
      key: "round-trip/1",
      status: "ok",
    },
  ],
  [
    "failed storage round trip",
    storageRoundTripResponseSchema,
    { environment: "preview", message: "Permission denied.", status: "failed" },
  ],
  [
    "model invocation",
    modelInvocationResponseSchema,
    {
      outcome: "SUCCESS",
      outputText: "pong",
      providerResponseId: "response-1",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    },
  ],
  [
    "download fixture",
    artifactDownloadFixtureSchema,
    { artifactId: "artifact-1", environment: "local", ready: true, stored: true },
  ],
];

const requests: ReadonlyArray<readonly [string, z.ZodType, unknown]> = [
  [
    "transformation command",
    transformationCommandSchema,
    {
      document: {},
      kind: "scaffold-add-word-bank",
      lesson,
      params: { supportLevel: "low" },
    },
  ],
  [
    "suggestion command",
    suggestionCommandSchema,
    {
      appliedTransformations: [
        { kind: "scaffold-add-word-bank", params: {}, targetBlockId: "question-1" },
      ],
      document: {},
      flowId: "worksheet-scaffolding",
      lesson,
    },
  ],
  ["Oak material request", oakMaterialRequestSchema, { lesson }],
  [
    "test job request",
    testJobRequestSchema,
    { idempotencyKey: "key-1", message: "Hi" },
  ],
  [
    "model invocation request",
    modelInvocationRequestSchema,
    { input: "Reply with pong" },
  ],
  [
    "DOCX export request",
    docxExportRequestSchema,
    { document: {}, embedFigures: false },
  ],
];

describe("dev API responses", () => {
  it.each(responses)(
    "%s ignores fields a newer API adds at any depth",
    (_, schema, response) => {
      expect(schema.parse(withUnknownFields(response))).toEqual(response);
    },
  );
});

describe("dev API requests", () => {
  it.each(requests)(
    "%s rejects a field it does not recognise at any depth",
    (_, schema, request) => {
      expect(schema.safeParse(request).success).toBe(true);
      for (const variant of withOneUnknownField(request)) {
        expect(schema.safeParse(variant).success).toBe(false);
      }
    },
  );
});
