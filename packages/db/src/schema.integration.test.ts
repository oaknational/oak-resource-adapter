import { randomUUID } from "node:crypto";

import { eq, inArray, isNull } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabaseClient } from "./client.js";
import {
  adaptations,
  jobs,
  modelInvocations,
  promptTemplates,
  resourceArtifacts,
  resourceDocuments,
  suggestedTransformations,
  transformationAttempts,
  transformationInputs,
  transformations,
} from "./schema/index.js";

const describeWithDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

/**
 * Identifiers here are synthetic. No test or fixture in this repository may
 * contain a real Clerk identifier, a teacher's name, or teacher-authored text.
 */
function syntheticClerkUserId(): string {
  return `user_test_${randomUUID().replaceAll("-", "")}`;
}

function worksheetEnvelope(title: string) {
  return {
    content: [{ content: [{ text: title, type: "text" }], id: "b1", type: "heading" }],
    id: randomUUID(),
    metadata: { keyStage: "ks3", subject: "maths", title },
    schemaVersion: "1.0",
    type: "worksheet",
  };
}

/** Drizzle wraps driver errors, so `constraint` sits down the `cause` chain. */
function violatedConstraint(error: unknown): string | undefined {
  let current: unknown = error;

  while (current !== null && typeof current === "object") {
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }

    current = "cause" in current ? current.cause : null;
  }

  return undefined;
}

/** Asserts a write failed on one specific constraint, not merely that it failed. */
async function expectConstraintViolation(
  write: Promise<unknown>,
  constraintName: string,
): Promise<void> {
  const error = await write.then(
    () => {
      throw new Error(
        `Expected the write to violate ${constraintName}, but it succeeded.`,
      );
    },
    (thrown: unknown) => thrown,
  );

  expect(violatedConstraint(error)).toBe(constraintName);
}

/**
 * Resolved per call: vitest evaluates a skipped suite's body, so building the
 * client eagerly would demand DATABASE_URL from the plain unit-test run.
 */
function database() {
  return getDatabaseClient();
}

describeWithDatabase("schema integration", () => {
  const createdAdaptationIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdPromptTemplateIds: string[] = [];

  afterEach(async () => {
    // Order matters: RESTRICT means jobs cannot go before the attempts that
    // reference them, nor templates before their invocations.
    const adaptationIds = createdAdaptationIds.splice(0);
    if (adaptationIds.length > 0) {
      await database()
        .delete(adaptations)
        .where(inArray(adaptations.id, adaptationIds));
    }

    const documentIds = createdDocumentIds.splice(0);
    if (documentIds.length > 0) {
      await database()
        .delete(resourceDocuments)
        .where(inArray(resourceDocuments.id, documentIds));
    }

    const jobIds = createdJobIds.splice(0);
    if (jobIds.length > 0) {
      await database().delete(jobs).where(inArray(jobs.id, jobIds));
    }

    const promptTemplateIds = createdPromptTemplateIds.splice(0);
    if (promptTemplateIds.length > 0) {
      await database()
        .delete(promptTemplates)
        .where(inArray(promptTemplates.id, promptTemplateIds));
    }
  });

  async function insertJob() {
    const [job] = await database()
      .insert(jobs)
      .values({
        idempotencyKey: `schema-integration-${randomUUID()}`,
        input: { transformationId: randomUUID() },
        kind: "transformation.apply",
      })
      .returning();

    if (!job) {
      throw new Error("Failed to insert the job fixture.");
    }

    createdJobIds.push(job.id);
    return job;
  }

  async function insertAdaptation(clerkUserId = syntheticClerkUserId()) {
    const [adaptation] = await database()
      .insert(adaptations)
      .values({
        capabilityId: "worksheetAdapter",
        clerkUserId,
        lessonSlug: "photosynthesis",
        programmeSlug: "science-secondary-ks3",
      })
      .returning();

    if (!adaptation) {
      throw new Error("Failed to insert the adaptation fixture.");
    }

    createdAdaptationIds.push(adaptation.id);
    return adaptation;
  }

  async function insertTransformation(
    adaptationId: string,
    kind = "lower-reading-age",
    targetBlockId: string | null = null,
  ) {
    const [transformation] = await database()
      .insert(transformations)
      .values({
        adaptationId,
        idempotencyKey: `request-${randomUUID()}`,
        kind,
        params: { targetReadingAge: 9 },
        targetBlockId,
      })
      .returning();

    if (!transformation) {
      throw new Error("Failed to insert the transformation fixture.");
    }

    return transformation;
  }

  async function insertAttempt(transformationId: string, attemptNumber = 1) {
    const job = await insertJob();
    const [attempt] = await database()
      .insert(transformationAttempts)
      .values({ attemptNumber, jobId: job.id, transformationId })
      .returning();

    if (!attempt) {
      throw new Error("Failed to insert the attempt fixture.");
    }

    return { attempt, job };
  }

  /** The common chain: an adaptation, one transformation, and one attempt. */
  async function insertChain() {
    const adaptation = await insertAdaptation();
    const transformation = await insertTransformation(adaptation.id);
    const { attempt, job } = await insertAttempt(transformation.id);

    return { adaptation, attempt, job, transformation };
  }

  async function insertOakResourceDocument(title: string) {
    const [document] = await database()
      .insert(resourceDocuments)
      .values({
        document: worksheetEnvelope(title),
        origin: "oak_resource",
        retrievedAt: new Date(),
        sourceId: `oak-resource-${randomUUID()}`,
        sourceReference: { extractor: "oak-extraction", pipelineVersion: "0.1.0" },
      })
      .returning();

    if (!document) {
      throw new Error("Failed to insert the Oak resource fixture.");
    }

    createdDocumentIds.push(document.id);
    return document;
  }

  async function insertGeneratedDocument(
    transformationAttemptId: string,
    title: string,
    position = 0,
  ) {
    const [document] = await database()
      .insert(resourceDocuments)
      .values({
        document: worksheetEnvelope(title),
        origin: "generated",
        position,
        transformationAttemptId,
      })
      .returning();

    if (!document) {
      throw new Error("Failed to insert the generated document fixture.");
    }

    return document;
  }

  async function insertPromptTemplate(identifier: string, version = 1) {
    const [template] = await database()
      .insert(promptTemplates)
      .values({
        gitSha: "0".repeat(40),
        hash: randomUUID().replaceAll("-", ""),
        identifier,
        template: "Rewrite the worksheet for reading age {{targetReadingAge}}.",
        version,
      })
      .returning();

    if (!template) {
      throw new Error("Failed to insert the prompt template fixture.");
    }

    createdPromptTemplateIds.push(template.id);
    return template;
  }

  function invocation(overrides: {
    promptTemplateId?: string;
    role?: string;
    transformationAttemptId: string;
  }) {
    return {
      correlationKey: `step_${randomUUID()}`,
      id: randomUUID(),
      model: "gpt-5.4-2026-03-05",
      provider: "openai",
      request: { input: "Rewrite this.", instructions: "You adapt worksheets." },
      role: "high-quality-rewrite",
      startedAt: new Date(),
      transport: "primary",
      ...overrides,
    };
  }

  it("stores and reads back a complete transformation, from request to downloadable artifact", async () => {
    const { adaptation, attempt, job, transformation } = await insertChain();
    const template = await insertPromptTemplate("lower-reading-age");

    const worksheet = await insertOakResourceDocument("Photosynthesis worksheet");
    const starterQuiz = await insertOakResourceDocument("Photosynthesis starter quiz");

    await database()
      .insert(transformationInputs)
      .values([
        {
          inputRole: "primary_source",
          position: 0,
          resourceDocumentId: worksheet.id,
          transformationId: transformation.id,
        },
        {
          inputRole: "context",
          position: 1,
          resourceDocumentId: starterQuiz.id,
          transformationId: transformation.id,
        },
      ]);

    const sharedStep = `step_${randomUUID()}`;
    await database()
      .insert(modelInvocations)
      .values([
        {
          ...invocation({
            role: "quick-classifier",
            transformationAttemptId: attempt.id,
          }),
          correlationKey: sharedStep,
          inputTokens: 1200,
          outputTokens: 340,
        },
        {
          ...invocation({
            promptTemplateId: template.id,
            transformationAttemptId: attempt.id,
          }),
          completedAt: new Date(),
          correlationKey: sharedStep,
          durationMs: 4120,
          inputTokens: 4800,
          outputTokens: 2100,
          providerResponseId: `resp_${randomUUID()}`,
          response: { output_text: "Rewritten." },
        },
      ]);

    const output = await insertGeneratedDocument(
      attempt.id,
      "Photosynthesis worksheet (age 9)",
    );

    await database()
      .update(adaptations)
      .set({ headResourceDocumentId: output.id })
      .where(eq(adaptations.id, adaptation.id));

    await database()
      .insert(resourceArtifacts)
      .values({
        byteSize: 48_216,
        format: "pdf",
        mimeType: "application/pdf",
        resourceDocumentId: output.id,
        storageKey: `adaptations/${adaptation.id}/worksheet.pdf`,
      });

    const stored = await database().query.adaptations.findFirst({
      where: eq(adaptations.id, adaptation.id),
    });
    expect(stored).toMatchObject({
      capabilityId: "worksheetAdapter",
      headResourceDocumentId: output.id,
      lessonSlug: "photosynthesis",
    });

    const storedTransformation = await database().query.transformations.findFirst({
      where: eq(transformations.id, transformation.id),
    });
    expect(storedTransformation).toMatchObject({
      adaptationId: adaptation.id,
      kind: "lower-reading-age",
      params: { targetReadingAge: 9 },
    });

    const attempts = await database()
      .select()
      .from(transformationAttempts)
      .where(eq(transformationAttempts.transformationId, transformation.id));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, jobId: job.id });

    const inputs = await database()
      .select()
      .from(transformationInputs)
      .where(eq(transformationInputs.transformationId, transformation.id))
      .orderBy(transformationInputs.position);
    expect(inputs.map((input) => [input.inputRole, input.resourceDocumentId])).toEqual([
      ["primary_source", worksheet.id],
      ["context", starterQuiz.id],
    ]);

    const invocations = await database()
      .select()
      .from(modelInvocations)
      .where(eq(modelInvocations.transformationAttemptId, attempt.id))
      .orderBy(modelInvocations.startedAt);
    expect(invocations).toHaveLength(2);
    expect(invocations.map((record) => record.role)).toContain("quick-classifier");
    expect(new Set(invocations.map((record) => record.correlationKey))).toEqual(
      new Set([sharedStep]),
    );
    const rewrite = invocations.find((record) => record.promptTemplateId !== null);
    expect(rewrite).toMatchObject({
      model: "gpt-5.4-2026-03-05",
      promptTemplateId: template.id,
      provider: "openai",
      request: { input: "Rewrite this.", instructions: "You adapt worksheets." },
      transport: "primary",
    });

    const artifacts = await database()
      .select()
      .from(resourceArtifacts)
      .where(eq(resourceArtifacts.resourceDocumentId, output.id));
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      byteSize: 48_216,
      format: "pdf",
      mimeType: "application/pdf",
    });
    expect(artifacts[0]?.storageKey).not.toMatch(/^https?:/);
  });

  it("chains transformations, moving the head to each new document", async () => {
    const adaptation = await insertAdaptation();
    const worksheet = await insertOakResourceDocument("Original worksheet");

    await database()
      .update(adaptations)
      .set({ headResourceDocumentId: worksheet.id })
      .where(eq(adaptations.id, adaptation.id));

    const first = await insertTransformation(adaptation.id, "lower-reading-age");
    const { attempt: firstAttempt } = await insertAttempt(first.id);
    await database().insert(transformationInputs).values({
      inputRole: "primary_source",
      position: 0,
      resourceDocumentId: worksheet.id,
      transformationId: first.id,
    });
    const firstOutput = await insertGeneratedDocument(firstAttempt.id, "Simplified");

    const second = await insertTransformation(adaptation.id, "add-scaffolding", "b1");
    const { attempt: secondAttempt } = await insertAttempt(second.id);
    await database().insert(transformationInputs).values({
      inputRole: "primary_source",
      position: 0,
      resourceDocumentId: firstOutput.id,
      transformationId: second.id,
    });
    const secondOutput = await insertGeneratedDocument(secondAttempt.id, "Scaffolded");

    await database()
      .update(adaptations)
      .set({ headResourceDocumentId: secondOutput.id })
      .where(eq(adaptations.id, adaptation.id));

    const chain = await database()
      .select()
      .from(transformations)
      .where(eq(transformations.adaptationId, adaptation.id))
      .orderBy(transformations.createdAt);
    expect(chain.map((step) => step.kind)).toEqual([
      "lower-reading-age",
      "add-scaffolding",
    ]);
    expect(chain[1]?.targetBlockId).toBe("b1");

    // Undo is a head move: the earlier document is still there to point at.
    await database()
      .update(adaptations)
      .set({ headResourceDocumentId: firstOutput.id })
      .where(eq(adaptations.id, adaptation.id));

    const afterUndo = await database().query.adaptations.findFirst({
      where: eq(adaptations.id, adaptation.id),
    });
    expect(afterUndo?.headResourceDocumentId).toBe(firstOutput.id);
  });

  it("refuses to delete the document an adaptation still points at", async () => {
    const { adaptation, attempt } = await insertChain();
    const head = await insertGeneratedDocument(attempt.id, "Current version");

    await database()
      .update(adaptations)
      .set({ headResourceDocumentId: head.id })
      .where(eq(adaptations.id, adaptation.id));

    await expectConstraintViolation(
      database().delete(resourceDocuments).where(eq(resourceDocuments.id, head.id)),
      "adaptations_head_document_fk",
    );
  });

  it("still erases the head document when the adaptation itself is deleted", async () => {
    const { adaptation, attempt } = await insertChain();
    const head = await insertGeneratedDocument(attempt.id, "Current version");

    await database()
      .update(adaptations)
      .set({ headResourceDocumentId: head.id })
      .where(eq(adaptations.id, adaptation.id));

    await database().delete(adaptations).where(eq(adaptations.id, adaptation.id));

    await expect(
      database()
        .select()
        .from(resourceDocuments)
        .where(eq(resourceDocuments.id, head.id)),
    ).resolves.toEqual([]);
  });

  it("records which offers a teacher accepted and which were ignored", async () => {
    const adaptation = await insertAdaptation();
    const suggesting = await insertTransformation(adaptation.id, "suggest");
    const { attempt: suggestingAttempt } = await insertAttempt(suggesting.id);
    const document = await insertOakResourceDocument("Worksheet to analyse");

    await database()
      .insert(suggestedTransformations)
      .values([
        {
          kind: "lower-reading-age",
          position: 0,
          resourceDocumentId: document.id,
          transformationAttemptId: suggestingAttempt.id,
        },
        {
          kind: "add-scaffolding",
          params: { questionCount: 2 },
          position: 1,
          resourceDocumentId: document.id,
          targetBlockId: "b1",
          transformationAttemptId: suggestingAttempt.id,
        },
      ]);

    const offered = await database()
      .select()
      .from(suggestedTransformations)
      .where(eq(suggestedTransformations.resourceDocumentId, document.id))
      .orderBy(suggestedTransformations.position);
    expect(offered.map((offer) => offer.kind)).toEqual([
      "lower-reading-age",
      "add-scaffolding",
    ]);

    const scaffolding = offered[1];
    if (!scaffolding) {
      throw new Error("Expected the scaffolding offer to have been stored.");
    }

    const accepted = await insertTransformation(adaptation.id, "add-scaffolding", "b1");
    await database()
      .update(suggestedTransformations)
      .set({ acceptedTransformationId: accepted.id })
      .where(eq(suggestedTransformations.id, scaffolding.id));

    const ignored = await database()
      .select({ kind: suggestedTransformations.kind })
      .from(suggestedTransformations)
      .where(isNull(suggestedTransformations.acceptedTransformationId));
    expect(ignored.map((offer) => offer.kind)).toContain("lower-reading-age");
    expect(ignored.map((offer) => offer.kind)).not.toContain("add-scaffolding");
  });

  it("refuses to attribute one transformation to two accepted offers", async () => {
    const adaptation = await insertAdaptation();
    const suggesting = await insertTransformation(adaptation.id, "suggest");
    const { attempt } = await insertAttempt(suggesting.id);
    const document = await insertOakResourceDocument("Worksheet to analyse");
    const accepted = await insertTransformation(adaptation.id, "add-scaffolding");

    await database().insert(suggestedTransformations).values({
      acceptedTransformationId: accepted.id,
      kind: "add-scaffolding",
      position: 0,
      resourceDocumentId: document.id,
      transformationAttemptId: attempt.id,
    });

    await expectConstraintViolation(
      database().insert(suggestedTransformations).values({
        acceptedTransformationId: accepted.id,
        kind: "add-scaffolding",
        position: 1,
        resourceDocumentId: document.id,
        transformationAttemptId: attempt.id,
      }),
      "suggested_transformations_accepted_key",
    );
  });

  it("discards a document's offers with the document, keeping earlier ones intact", async () => {
    const adaptation = await insertAdaptation();
    const suggesting = await insertTransformation(adaptation.id, "suggest");
    const { attempt } = await insertAttempt(suggesting.id);
    const superseded = await insertGeneratedDocument(attempt.id, "Superseded version");
    const survivor = await insertOakResourceDocument("Earlier version");

    await database()
      .insert(suggestedTransformations)
      .values([
        {
          kind: "lower-reading-age",
          position: 0,
          resourceDocumentId: superseded.id,
          transformationAttemptId: attempt.id,
        },
        {
          kind: "lower-reading-age",
          position: 1,
          resourceDocumentId: survivor.id,
          transformationAttemptId: attempt.id,
        },
      ]);

    await database()
      .delete(resourceDocuments)
      .where(eq(resourceDocuments.id, superseded.id));

    const remaining = await database()
      .select({ resourceDocumentId: suggestedTransformations.resourceDocumentId })
      .from(suggestedTransformations)
      .where(eq(suggestedTransformations.transformationAttemptId, attempt.id));
    expect(remaining).toEqual([{ resourceDocumentId: survivor.id }]);
  });

  it("rejects a second request reusing an idempotency key", async () => {
    const adaptation = await insertAdaptation();
    const transformation = await insertTransformation(adaptation.id);

    await expectConstraintViolation(
      database().insert(transformations).values({
        adaptationId: adaptation.id,
        idempotencyKey: transformation.idempotencyKey,
        kind: "lower-reading-age",
      }),
      "transformations_idempotency_key_unique",
    );
  });

  it("allows an adaptation outside a lesson or programme", async () => {
    const [adaptation] = await database()
      .insert(adaptations)
      .values({
        capabilityId: "homeworkGenerator",
        clerkUserId: syntheticClerkUserId(),
      })
      .returning();

    if (!adaptation) {
      throw new Error("Failed to insert the adaptation fixture.");
    }

    createdAdaptationIds.push(adaptation.id);
    expect(adaptation).toMatchObject({
      headResourceDocumentId: null,
      lessonSlug: null,
      programmeSlug: null,
    });
  });

  it("requires each input position to be unique within a transformation", async () => {
    const adaptation = await insertAdaptation();
    const transformation = await insertTransformation(adaptation.id);
    const worksheet = await insertOakResourceDocument("Worksheet");
    const lessonGuide = await insertOakResourceDocument("Lesson guide");

    await database().insert(transformationInputs).values({
      inputRole: "primary_source",
      position: 0,
      resourceDocumentId: worksheet.id,
      transformationId: transformation.id,
    });

    await expectConstraintViolation(
      database().insert(transformationInputs).values({
        inputRole: "context",
        position: 0,
        resourceDocumentId: lessonGuide.id,
        transformationId: transformation.id,
      }),
      "transformation_inputs_position_key",
    );
  });

  it("shares one set of inputs across every attempt at the same transformation", async () => {
    const adaptation = await insertAdaptation();
    const transformation = await insertTransformation(adaptation.id);
    const worksheet = await insertOakResourceDocument("Worksheet");

    await database().insert(transformationInputs).values({
      inputRole: "primary_source",
      position: 0,
      resourceDocumentId: worksheet.id,
      transformationId: transformation.id,
    });

    const { attempt: first } = await insertAttempt(transformation.id, 1);
    const { attempt: second } = await insertAttempt(transformation.id, 2);
    await insertGeneratedDocument(first.id, "First try");
    await insertGeneratedDocument(second.id, "Second try");

    const inputs = await database()
      .select()
      .from(transformationInputs)
      .where(eq(transformationInputs.transformationId, transformation.id));
    expect(inputs).toHaveLength(1);

    // Each attempt still owns its own output.
    const outputs = await database()
      .select({ transformationAttemptId: resourceDocuments.transformationAttemptId })
      .from(resourceDocuments)
      .where(inArray(resourceDocuments.transformationAttemptId, [first.id, second.id]));
    expect(outputs).toHaveLength(2);
  });

  it("allows a transformation to be retried as a further numbered attempt", async () => {
    const adaptation = await insertAdaptation();
    const transformation = await insertTransformation(adaptation.id);
    await insertAttempt(transformation.id, 1);
    await insertAttempt(transformation.id, 2);

    const attempts = await database()
      .select()
      .from(transformationAttempts)
      .where(eq(transformationAttempts.transformationId, transformation.id))
      .orderBy(transformationAttempts.attemptNumber);

    expect(attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
  });

  it("rejects a duplicate attempt number, so a double-clicked retry cannot run twice", async () => {
    const adaptation = await insertAdaptation();
    const transformation = await insertTransformation(adaptation.id);
    await insertAttempt(transformation.id, 1);
    const job = await insertJob();

    await expectConstraintViolation(
      database().insert(transformationAttempts).values({
        attemptNumber: 1,
        jobId: job.id,
        transformationId: transformation.id,
      }),
      "transformation_attempts_number_key",
    );
  });

  it("binds each attempt to exactly one job", async () => {
    const adaptation = await insertAdaptation();
    const transformation = await insertTransformation(adaptation.id);
    const { job } = await insertAttempt(transformation.id, 1);

    await expectConstraintViolation(
      database().insert(transformationAttempts).values({
        attemptNumber: 2,
        jobId: job.id,
        transformationId: transformation.id,
      }),
      "transformation_attempts_job_id_unique",
    );
  });

  it("refuses to delete a job that an attempt still relies on for its audit trail", async () => {
    const { job } = await insertChain();

    await expectConstraintViolation(
      database().delete(jobs).where(eq(jobs.id, job.id)),
      "transformation_attempts_job_fk",
    );
  });

  it("refuses to delete a prompt template that an invocation still references", async () => {
    const { attempt } = await insertChain();
    const template = await insertPromptTemplate("lower-reading-age");

    await database()
      .insert(modelInvocations)
      .values(
        invocation({
          promptTemplateId: template.id,
          transformationAttemptId: attempt.id,
        }),
      );

    await expectConstraintViolation(
      database().delete(promptTemplates).where(eq(promptTemplates.id, template.id)),
      "model_invocations_prompt_template_fk",
    );
  });

  it("requires a generated document to name its producing attempt, and an Oak resource not to", async () => {
    const { attempt } = await insertChain();
    const document = worksheetEnvelope("Orphaned output");

    await expectConstraintViolation(
      database().insert(resourceDocuments).values({ document, origin: "generated" }),
      "resource_documents_generated_has_attempt_and_position",
    );

    await expectConstraintViolation(
      database().insert(resourceDocuments).values({
        document,
        origin: "oak_resource",
        transformationAttemptId: attempt.id,
      }),
      "resource_documents_generated_has_attempt_and_position",
    );
  });

  it("lets a generated document become a later input without allowing its provenance to be deleted", async () => {
    const first = await insertChain();
    const firstOutput = await insertGeneratedDocument(
      first.attempt.id,
      "Adapted worksheet",
    );

    const secondAdaptation = await insertAdaptation();
    const secondTransformation = await insertTransformation(secondAdaptation.id);

    await database().insert(transformationInputs).values({
      inputRole: "primary_source",
      position: 0,
      resourceDocumentId: firstOutput.id,
      transformationId: secondTransformation.id,
    });

    const inputs = await database()
      .select()
      .from(transformationInputs)
      .where(eq(transformationInputs.transformationId, secondTransformation.id));

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.resourceDocumentId).toBe(firstOutput.id);

    await expectConstraintViolation(
      database().delete(adaptations).where(eq(adaptations.id, first.adaptation.id)),
      "transformation_inputs_document_fk",
    );
  });

  it("generates a document from prompts alone, with no input resources at all", async () => {
    const { attempt, transformation } = await insertChain();

    await database()
      .insert(modelInvocations)
      .values(invocation({ transformationAttemptId: attempt.id }));

    const output = await insertGeneratedDocument(attempt.id, "Homework task");

    expect(output).toBeDefined();
    await expect(
      database()
        .select()
        .from(transformationInputs)
        .where(eq(transformationInputs.transformationId, transformation.id)),
    ).resolves.toEqual([]);
  });

  it("records several documents produced by one attempt", async () => {
    const { attempt } = await insertChain();

    await insertGeneratedDocument(attempt.id, "Pupil worksheet", 0);
    await insertGeneratedDocument(attempt.id, "Answer sheet", 1);

    const outputs = await database()
      .select()
      .from(resourceDocuments)
      .where(eq(resourceDocuments.transformationAttemptId, attempt.id))
      .orderBy(resourceDocuments.position);

    expect(outputs).toHaveLength(2);
    expect(outputs.map((output) => output.position)).toEqual([0, 1]);

    await expectConstraintViolation(
      database()
        .insert(resourceDocuments)
        .values({
          document: worksheetEnvelope("Conflicting output"),
          origin: "generated",
          position: 1,
          transformationAttemptId: attempt.id,
        }),
      "resource_documents_attempt_position_key",
    );
  });

  it("requires every artifact to own a distinct immutable storage key", async () => {
    const { adaptation, attempt } = await insertChain();
    const output = await insertGeneratedDocument(attempt.id, "Homework task");

    const storageKey = `adaptations/${adaptation.id}/homework.pdf`;
    await database().insert(resourceArtifacts).values({
      byteSize: 1024,
      format: "pdf",
      mimeType: "application/pdf",
      resourceDocumentId: output.id,
      storageKey,
    });

    await expectConstraintViolation(
      database().insert(resourceArtifacts).values({
        byteSize: 2048,
        format: "pdf",
        mimeType: "application/pdf",
        resourceDocumentId: output.id,
        storageKey,
      }),
      "resource_artifacts_storage_key_unique",
    );
  });

  it("erases the whole subtree when an adaptation is deleted, keeping Oak resources, the job and the prompt template", async () => {
    const { adaptation, attempt, job, transformation } = await insertChain();
    const template = await insertPromptTemplate("lower-reading-age");
    const worksheet = await insertOakResourceDocument("Survives erasure");

    await database().insert(transformationInputs).values({
      inputRole: "primary_source",
      position: 0,
      resourceDocumentId: worksheet.id,
      transformationId: transformation.id,
    });
    await database()
      .insert(modelInvocations)
      .values(
        invocation({
          promptTemplateId: template.id,
          transformationAttemptId: attempt.id,
        }),
      );

    const output = await insertGeneratedDocument(attempt.id, "Erased output");
    await database()
      .insert(resourceArtifacts)
      .values({
        byteSize: 2048,
        format: "docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        resourceDocumentId: output.id,
        storageKey: `adaptations/${adaptation.id}/erased.docx`,
      });
    await database().insert(suggestedTransformations).values({
      kind: "add-scaffolding",
      position: 0,
      resourceDocumentId: output.id,
      transformationAttemptId: attempt.id,
    });

    // The input edge RESTRICTs the Oak resource, not the other way round, so it
    // has to go before the adaptation that owns it.
    await database()
      .delete(transformationInputs)
      .where(eq(transformationInputs.transformationId, transformation.id));
    await database().delete(adaptations).where(eq(adaptations.id, adaptation.id));

    await expect(
      database()
        .select()
        .from(transformations)
        .where(eq(transformations.id, transformation.id)),
    ).resolves.toEqual([]);
    await expect(
      database()
        .select()
        .from(transformationAttempts)
        .where(eq(transformationAttempts.id, attempt.id)),
    ).resolves.toEqual([]);
    await expect(
      database()
        .select()
        .from(modelInvocations)
        .where(eq(modelInvocations.transformationAttemptId, attempt.id)),
    ).resolves.toEqual([]);
    await expect(
      database()
        .select()
        .from(resourceDocuments)
        .where(eq(resourceDocuments.id, output.id)),
    ).resolves.toEqual([]);
    await expect(
      database()
        .select()
        .from(resourceArtifacts)
        .where(eq(resourceArtifacts.resourceDocumentId, output.id)),
    ).resolves.toEqual([]);
    await expect(
      database()
        .select()
        .from(suggestedTransformations)
        .where(eq(suggestedTransformations.resourceDocumentId, output.id)),
    ).resolves.toEqual([]);

    // Shared rows survive.
    await expect(
      database().select().from(jobs).where(eq(jobs.id, job.id)),
    ).resolves.toHaveLength(1);
    await expect(
      database()
        .select()
        .from(resourceDocuments)
        .where(eq(resourceDocuments.id, worksheet.id)),
    ).resolves.toHaveLength(1);
    await expect(
      database()
        .select()
        .from(promptTemplates)
        .where(eq(promptTemplates.id, template.id)),
    ).resolves.toHaveLength(1);
  });
});
