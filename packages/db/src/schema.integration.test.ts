import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabaseClient } from "./client.js";
import {
  attemptInputResourceDocuments,
  generationAttempts,
  generations,
  jobs,
  modelInvocations,
  promptTemplates,
  resourceArtifacts,
  resourceDocuments,
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
  const createdGenerationIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdPromptTemplateIds: string[] = [];

  afterEach(async () => {
    // Order matters: RESTRICT means jobs cannot go before the attempts that
    // reference them, nor templates before their invocations.
    const generationIds = createdGenerationIds.splice(0);
    if (generationIds.length > 0) {
      await database()
        .delete(generations)
        .where(inArray(generations.id, generationIds));
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
        input: { generationAttemptId: randomUUID() },
        kind: "generation.worksheetAdapter",
      })
      .returning();

    if (!job) {
      throw new Error("Failed to insert the job fixture.");
    }

    createdJobIds.push(job.id);
    return job;
  }

  async function insertGeneration(clerkUserId = syntheticClerkUserId()) {
    const [generation] = await database()
      .insert(generations)
      .values({
        capabilityId: "worksheetAdapter",
        clerkUserId,
        idempotencyKey: `request-${randomUUID()}`,
        lessonSlug: "photosynthesis",
        programmeSlug: "science-secondary-ks3",
        request: { targetReadingAge: 9 },
      })
      .returning();

    if (!generation) {
      throw new Error("Failed to insert the generation fixture.");
    }

    createdGenerationIds.push(generation.id);
    return generation;
  }

  async function insertAttempt(generationId: string, attemptNumber = 1) {
    const job = await insertJob();
    const [attempt] = await database()
      .insert(generationAttempts)
      .values({ attemptNumber, generationId, jobId: job.id })
      .returning();

    if (!attempt) {
      throw new Error("Failed to insert the attempt fixture.");
    }

    return { attempt, job };
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
    generationAttemptId: string;
    promptTemplateId?: string;
    role?: string;
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

  it("stores and reads back a complete generation, from request to downloadable artifact", async () => {
    const generation = await insertGeneration();
    const { attempt, job } = await insertAttempt(generation.id);
    const template = await insertPromptTemplate("lower-reading-age");

    const worksheet = await insertOakResourceDocument("Photosynthesis worksheet");
    const starterQuiz = await insertOakResourceDocument("Photosynthesis starter quiz");

    await database()
      .insert(attemptInputResourceDocuments)
      .values([
        {
          generationAttemptId: attempt.id,
          inputRole: "primary_source",
          position: 0,
          resourceDocumentId: worksheet.id,
        },
        {
          generationAttemptId: attempt.id,
          inputRole: "context",
          position: 1,
          resourceDocumentId: starterQuiz.id,
        },
      ]);

    const sharedStep = `step_${randomUUID()}`;
    await database()
      .insert(modelInvocations)
      .values([
        {
          ...invocation({ generationAttemptId: attempt.id, role: "quick-classifier" }),
          correlationKey: sharedStep,
          inputTokens: 1200,
          outputTokens: 340,
        },
        {
          ...invocation({
            generationAttemptId: attempt.id,
            promptTemplateId: template.id,
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

    const [output] = await database()
      .insert(resourceDocuments)
      .values({
        document: worksheetEnvelope("Photosynthesis worksheet (age 9)"),
        generationAttemptId: attempt.id,
        origin: "generated",
        position: 0,
      })
      .returning();

    if (!output) {
      throw new Error("Failed to insert the generated document.");
    }

    await database()
      .insert(resourceArtifacts)
      .values({
        byteSize: 48_216,
        format: "pdf",
        mimeType: "application/pdf",
        resourceDocumentId: output.id,
        storageKey: `generations/${generation.id}/worksheet.pdf`,
      });

    const stored = await database().query.generations.findFirst({
      where: eq(generations.id, generation.id),
    });
    expect(stored).toMatchObject({
      capabilityId: "worksheetAdapter",
      lessonSlug: "photosynthesis",
      request: { targetReadingAge: 9 },
    });

    const attempts = await database()
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.generationId, generation.id));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, jobId: job.id });

    const inputs = await database()
      .select()
      .from(attemptInputResourceDocuments)
      .where(eq(attemptInputResourceDocuments.generationAttemptId, attempt.id))
      .orderBy(attemptInputResourceDocuments.position);
    expect(inputs.map((input) => [input.inputRole, input.resourceDocumentId])).toEqual([
      ["primary_source", worksheet.id],
      ["context", starterQuiz.id],
    ]);

    const invocations = await database()
      .select()
      .from(modelInvocations)
      .where(eq(modelInvocations.generationAttemptId, attempt.id))
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

    const outputs = await database()
      .select()
      .from(resourceDocuments)
      .where(eq(resourceDocuments.generationAttemptId, attempt.id));
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      document: {
        schemaVersion: "1.0",
        type: "worksheet",
      },
      origin: "generated",
      position: 0,
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

  it("rejects a second request reusing an idempotency key", async () => {
    const generation = await insertGeneration();

    await expectConstraintViolation(
      database()
        .insert(generations)
        .values({
          capabilityId: "worksheetAdapter",
          clerkUserId: syntheticClerkUserId(),
          idempotencyKey: generation.idempotencyKey,
          lessonSlug: "photosynthesis",
          programmeSlug: "science-secondary-ks3",
          request: { targetReadingAge: 9 },
        }),
      "generations_idempotency_key_unique",
    );
  });

  it("allows generation outside a lesson or programme", async () => {
    const [generation] = await database()
      .insert(generations)
      .values({
        capabilityId: "homeworkGenerator",
        clerkUserId: syntheticClerkUserId(),
        idempotencyKey: `request-${randomUUID()}`,
        request: { prompt: "Create six homework tasks." },
      })
      .returning();

    if (!generation) {
      throw new Error("Failed to insert the generation fixture.");
    }

    createdGenerationIds.push(generation.id);
    expect(generation).toMatchObject({
      lessonSlug: null,
      programmeSlug: null,
    });
  });

  it("requires each input position to be unique within an attempt", async () => {
    const generation = await insertGeneration();
    const { attempt } = await insertAttempt(generation.id);
    const worksheet = await insertOakResourceDocument("Worksheet");
    const lessonGuide = await insertOakResourceDocument("Lesson guide");

    await database().insert(attemptInputResourceDocuments).values({
      generationAttemptId: attempt.id,
      inputRole: "primary_source",
      position: 0,
      resourceDocumentId: worksheet.id,
    });

    await expectConstraintViolation(
      database().insert(attemptInputResourceDocuments).values({
        generationAttemptId: attempt.id,
        inputRole: "context",
        position: 0,
        resourceDocumentId: lessonGuide.id,
      }),
      "attempt_input_resource_documents_attempt_position_key",
    );
  });

  it("allows a generation to be retried as a further numbered attempt", async () => {
    const generation = await insertGeneration();
    await insertAttempt(generation.id, 1);
    await insertAttempt(generation.id, 2);

    const attempts = await database()
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.generationId, generation.id))
      .orderBy(generationAttempts.attemptNumber);

    expect(attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
  });

  it("rejects a duplicate attempt number, so a double-clicked retry cannot run twice", async () => {
    const generation = await insertGeneration();
    await insertAttempt(generation.id, 1);
    const job = await insertJob();

    await expectConstraintViolation(
      database().insert(generationAttempts).values({
        attemptNumber: 1,
        generationId: generation.id,
        jobId: job.id,
      }),
      "generation_attempts_generation_id_attempt_number_key",
    );
  });

  it("binds each attempt to exactly one job", async () => {
    const generation = await insertGeneration();
    const { job } = await insertAttempt(generation.id, 1);

    await expectConstraintViolation(
      database().insert(generationAttempts).values({
        attemptNumber: 2,
        generationId: generation.id,
        jobId: job.id,
      }),
      "generation_attempts_job_id_unique",
    );
  });

  it("refuses to delete a job that an attempt still relies on for its audit trail", async () => {
    const generation = await insertGeneration();
    const { job } = await insertAttempt(generation.id);

    await expectConstraintViolation(
      database().delete(jobs).where(eq(jobs.id, job.id)),
      "generation_attempts_job_id_jobs_id_fk",
    );
  });

  it("refuses to delete a prompt template that an invocation still references", async () => {
    const generation = await insertGeneration();
    const { attempt } = await insertAttempt(generation.id);
    const template = await insertPromptTemplate("lower-reading-age");

    await database()
      .insert(modelInvocations)
      .values(
        invocation({ generationAttemptId: attempt.id, promptTemplateId: template.id }),
      );

    await expectConstraintViolation(
      database().delete(promptTemplates).where(eq(promptTemplates.id, template.id)),
      "model_invocations_prompt_template_id_prompt_templates_id_fk",
    );
  });

  it("requires a generated document to name its producing attempt, and an Oak resource not to", async () => {
    const generation = await insertGeneration();
    const { attempt } = await insertAttempt(generation.id);
    const document = worksheetEnvelope("Orphaned output");

    await expectConstraintViolation(
      database().insert(resourceDocuments).values({ document, origin: "generated" }),
      "resource_documents_generated_has_attempt_and_position",
    );

    await expectConstraintViolation(
      database().insert(resourceDocuments).values({
        document,
        generationAttemptId: attempt.id,
        origin: "oak_resource",
      }),
      "resource_documents_generated_has_attempt_and_position",
    );
  });

  it("lets a generated document become a later input without allowing its provenance to be deleted", async () => {
    const firstGeneration = await insertGeneration();
    const { attempt: firstAttempt } = await insertAttempt(firstGeneration.id);

    const [firstOutput] = await database()
      .insert(resourceDocuments)
      .values({
        document: worksheetEnvelope("Adapted worksheet"),
        generationAttemptId: firstAttempt.id,
        origin: "generated",
        position: 0,
      })
      .returning();

    if (!firstOutput) {
      throw new Error("Failed to insert the first generated document.");
    }

    const secondGeneration = await insertGeneration();
    const { attempt: secondAttempt } = await insertAttempt(secondGeneration.id);

    await database().insert(attemptInputResourceDocuments).values({
      generationAttemptId: secondAttempt.id,
      inputRole: "primary_source",
      position: 0,
      resourceDocumentId: firstOutput.id,
    });

    const inputs = await database()
      .select()
      .from(attemptInputResourceDocuments)
      .where(eq(attemptInputResourceDocuments.generationAttemptId, secondAttempt.id));

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.resourceDocumentId).toBe(firstOutput.id);

    await expectConstraintViolation(
      database().delete(generations).where(eq(generations.id, firstGeneration.id)),
      "attempt_input_resource_documents_document_fk",
    );
  });

  it("generates a document from prompts alone, with no input resources at all", async () => {
    const generation = await insertGeneration();
    const { attempt } = await insertAttempt(generation.id);

    await database()
      .insert(modelInvocations)
      .values(invocation({ generationAttemptId: attempt.id }));

    const [output] = await database()
      .insert(resourceDocuments)
      .values({
        document: worksheetEnvelope("Homework task"),
        generationAttemptId: attempt.id,
        origin: "generated",
        position: 0,
      })
      .returning();

    expect(output).toBeDefined();
    await expect(
      database()
        .select()
        .from(attemptInputResourceDocuments)
        .where(eq(attemptInputResourceDocuments.generationAttemptId, attempt.id)),
    ).resolves.toEqual([]);
  });

  it("records several documents produced by one attempt", async () => {
    const generation = await insertGeneration();
    const { attempt } = await insertAttempt(generation.id);

    await database()
      .insert(resourceDocuments)
      .values([
        {
          document: worksheetEnvelope("Pupil worksheet"),
          generationAttemptId: attempt.id,
          origin: "generated",
          position: 0,
        },
        {
          document: worksheetEnvelope("Answer sheet"),
          generationAttemptId: attempt.id,
          origin: "generated",
          position: 1,
        },
      ]);

    const outputs = await database()
      .select()
      .from(resourceDocuments)
      .where(eq(resourceDocuments.generationAttemptId, attempt.id))
      .orderBy(resourceDocuments.position);

    expect(outputs).toHaveLength(2);
    expect(outputs.map((output) => output.position)).toEqual([0, 1]);

    await expectConstraintViolation(
      database()
        .insert(resourceDocuments)
        .values({
          document: worksheetEnvelope("Conflicting output"),
          generationAttemptId: attempt.id,
          origin: "generated",
          position: 1,
        }),
      "resource_documents_generation_attempt_id_position_key",
    );
  });

  it("requires every artifact to own a distinct immutable storage key", async () => {
    const generation = await insertGeneration();
    const { attempt } = await insertAttempt(generation.id);
    const [output] = await database()
      .insert(resourceDocuments)
      .values({
        document: worksheetEnvelope("Homework task"),
        generationAttemptId: attempt.id,
        origin: "generated",
        position: 0,
      })
      .returning();

    if (!output) {
      throw new Error("Failed to insert the generated document.");
    }

    const storageKey = `generations/${generation.id}/homework.pdf`;
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

  it("erases the whole subtree when a generation is deleted, keeping Oak resources, the job and the prompt template", async () => {
    const generation = await insertGeneration();
    const { attempt, job } = await insertAttempt(generation.id);
    const template = await insertPromptTemplate("lower-reading-age");
    const worksheet = await insertOakResourceDocument("Survives erasure");

    await database().insert(attemptInputResourceDocuments).values({
      generationAttemptId: attempt.id,
      inputRole: "primary_source",
      position: 0,
      resourceDocumentId: worksheet.id,
    });
    await database()
      .insert(modelInvocations)
      .values(
        invocation({ generationAttemptId: attempt.id, promptTemplateId: template.id }),
      );

    const [output] = await database()
      .insert(resourceDocuments)
      .values({
        document: worksheetEnvelope("Erased output"),
        generationAttemptId: attempt.id,
        origin: "generated",
        position: 0,
      })
      .returning();

    if (!output) {
      throw new Error("Failed to insert the generated document.");
    }

    await database()
      .insert(resourceArtifacts)
      .values({
        byteSize: 1024,
        format: "pdf",
        mimeType: "application/pdf",
        resourceDocumentId: output.id,
        storageKey: `generations/${generation.id}/erased.pdf`,
      });

    await database().delete(generations).where(eq(generations.id, generation.id));
    createdGenerationIds.splice(createdGenerationIds.indexOf(generation.id), 1);

    await expect(
      database()
        .select()
        .from(generationAttempts)
        .where(eq(generationAttempts.id, attempt.id)),
    ).resolves.toEqual([]);
    await expect(
      database()
        .select()
        .from(attemptInputResourceDocuments)
        .where(eq(attemptInputResourceDocuments.generationAttemptId, attempt.id)),
    ).resolves.toEqual([]);
    await expect(
      database()
        .select()
        .from(modelInvocations)
        .where(eq(modelInvocations.generationAttemptId, attempt.id)),
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

    // Oak resources, jobs and prompt templates are shared, so they survive.
    await expect(
      database()
        .select()
        .from(resourceDocuments)
        .where(eq(resourceDocuments.id, worksheet.id)),
    ).resolves.toHaveLength(1);
    await expect(
      database().select().from(jobs).where(eq(jobs.id, job.id)),
    ).resolves.toHaveLength(1);
    await expect(
      database()
        .select()
        .from(promptTemplates)
        .where(eq(promptTemplates.id, template.id)),
    ).resolves.toHaveLength(1);
  });
});
