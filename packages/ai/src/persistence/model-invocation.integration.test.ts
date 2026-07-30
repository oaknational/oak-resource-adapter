import { randomUUID } from "node:crypto";

import {
  adaptations,
  getDatabaseClient,
  jobs,
  modelInvocations,
  promptTemplates,
  transformationAttempts,
  transformations,
} from "@oaknational/resource-adapter-db";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDatabaseInvocationRecorder,
  createModelInvoker,
  definePromptTemplate,
  defineRoleBindings,
  preparePrompt,
  type ModelInvocationResponse,
  type ModelTransport,
} from "../index.js";

const describeWithDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const roleBindings = defineRoleBindings({
  "quick-classifier": { model: "gpt-5.4-2026-03-05", transport: "primary" },
});

const template = definePromptTemplate({
  identifier: "integration-lower-reading-age",
  template: "Rewrite for reading age {{readingAge}}.",
  version: 1,
});

/**
 * Resolved per call: vitest evaluates a skipped suite's body, so building the
 * client eagerly would demand DATABASE_URL from the plain unit-test run.
 */
function database() {
  return getDatabaseClient();
}

function responseFixture(): ModelInvocationResponse {
  return {
    id: "resp_integration_1",
    output_text: "classified",
    usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
  } as unknown as ModelInvocationResponse;
}

describeWithDatabase("model invocation persistence", () => {
  const createdAdaptationIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdTemplateIdentifiers: string[] = [];

  afterEach(async () => {
    // Order matters: the attempt CASCADE removes its invocations, which must go
    // before the templates they RESTRICT, and before the jobs they reference.
    const adaptationIds = createdAdaptationIds.splice(0);
    if (adaptationIds.length > 0) {
      await database()
        .delete(adaptations)
        .where(inArray(adaptations.id, adaptationIds));
    }

    const jobIds = createdJobIds.splice(0);
    if (jobIds.length > 0) {
      await database().delete(jobs).where(inArray(jobs.id, jobIds));
    }

    const identifiers = createdTemplateIdentifiers.splice(0);
    if (identifiers.length > 0) {
      await database()
        .delete(promptTemplates)
        .where(inArray(promptTemplates.identifier, identifiers));
    }
  });

  async function insertAttempt(): Promise<string> {
    const [job] = await database()
      .insert(jobs)
      .values({
        idempotencyKey: `ai-integration-${randomUUID()}`,
        input: {},
        kind: "transformation.apply",
      })
      .returning({ id: jobs.id });

    const [adaptation] = await database()
      .insert(adaptations)
      .values({
        capabilityId: "worksheetAdapter",
        clerkUserId: `user_test_${randomUUID().replaceAll("-", "")}`,
      })
      .returning({ id: adaptations.id });

    if (!job || !adaptation) {
      throw new Error("Failed to insert the attempt fixture.");
    }

    createdJobIds.push(job.id);
    createdAdaptationIds.push(adaptation.id);

    const [transformation] = await database()
      .insert(transformations)
      .values({
        adaptationId: adaptation.id,
        idempotencyKey: `request-${randomUUID()}`,
        kind: "lower-reading-age",
      })
      .returning({ id: transformations.id });

    if (!transformation) {
      throw new Error("Failed to insert the transformation fixture.");
    }

    const [attempt] = await database()
      .insert(transformationAttempts)
      .values({
        attemptNumber: 1,
        jobId: job.id,
        transformationId: transformation.id,
      })
      .returning({ id: transformationAttempts.id });

    if (!attempt) {
      throw new Error("Failed to insert the transformation attempt fixture.");
    }

    return attempt.id;
  }

  function trackTemplate(identifier: string): void {
    createdTemplateIdentifiers.push(identifier);
  }

  it("records a successful invocation against its prompt template", async () => {
    const transformationAttemptId = await insertAttempt();
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    trackTemplate(template.identifier);

    const prompt = await preparePrompt({ template, variables: { readingAge: "9" } });
    const response = responseFixture();
    const invoker = createModelInvoker({
      roleBindings,
      recorder: createDatabaseInvocationRecorder({ transformationAttemptId }),
      transports: { primary: { invoke: async () => response } },
    });

    await invoker.invoke({
      correlationKey: "workflow-step-1",
      promptTemplateId: prompt.promptTemplateId,
      request: { input: prompt.text },
      role: "quick-classifier",
    });

    const [row] = await database()
      .select()
      .from(modelInvocations)
      .where(eq(modelInvocations.transformationAttemptId, transformationAttemptId));

    expect(row).toMatchObject({
      correlationKey: "workflow-step-1",
      errorName: null,
      inputTokens: 12,
      model: "gpt-5.4-2026-03-05",
      outputTokens: 3,
      promptTemplateId: prompt.promptTemplateId,
      provider: "openai",
      providerResponseId: "resp_integration_1",
      request: { input: "Rewrite for reading age 9." },
      role: "quick-classifier",
      transport: "primary",
    });
    expect(row?.completedAt).toBeInstanceOf(Date);
    expect(row?.durationMs).toBeGreaterThanOrEqual(0);

    const [storedTemplate] = await database()
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.id, prompt.promptTemplateId));

    // The stored body keeps its placeholders; the request carries the content.
    expect(storedTemplate).toMatchObject({
      gitSha: "abc123",
      identifier: template.identifier,
      template: "Rewrite for reading age {{readingAge}}.",
      version: 1,
    });
  });

  it("records classified metadata rather than the raw error when a call fails", async () => {
    const transformationAttemptId = await insertAttempt();
    const failure = Object.assign(new Error("Prompt content must not be persisted"), {
      code: "rate_limit_exceeded",
      status: 429,
    });
    const invoker = createModelInvoker({
      roleBindings,
      recorder: createDatabaseInvocationRecorder({ transformationAttemptId }),
      transports: {
        primary: {
          invoke: async () => {
            throw failure;
          },
        },
      },
    });

    await expect(
      invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
    ).rejects.toBe(failure);

    const [row] = await database()
      .select()
      .from(modelInvocations)
      .where(eq(modelInvocations.transformationAttemptId, transformationAttemptId));

    expect(row).toMatchObject({
      errorCode: "rate_limit_exceeded",
      errorName: "Error",
      errorStatus: 429,
      promptTemplateId: null,
      response: null,
    });
    expect(JSON.stringify(row)).not.toContain("must not be persisted");
  });

  it("prevents the model call when the invocation cannot be recorded", async () => {
    const transport: ModelTransport = { invoke: vi.fn(async () => responseFixture()) };
    const invoker = createModelInvoker({
      roleBindings,
      // No such attempt, so the insert violates its foreign key.
      recorder: createDatabaseInvocationRecorder({
        transformationAttemptId: randomUUID(),
      }),
      transports: { primary: transport },
    });

    await expect(
      invoker.invoke({ request: { input: "Classify" }, role: "quick-classifier" }),
    ).rejects.toThrow();
    expect(transport.invoke).not.toHaveBeenCalled();
  });

  it("reuses one row for a template used repeatedly", async () => {
    trackTemplate(template.identifier);

    const first = await preparePrompt({ template, variables: { readingAge: "9" } });
    const second = await preparePrompt({ template, variables: { readingAge: "7" } });

    expect(second.promptTemplateId).toBe(first.promptTemplateId);
    expect(second.text).not.toBe(first.text);

    const rows = await database()
      .select({ id: promptTemplates.id })
      .from(promptTemplates)
      .where(eq(promptTemplates.identifier, template.identifier));

    expect(rows).toHaveLength(1);
  });

  it("does not register the template when rendering fails", async () => {
    trackTemplate(template.identifier);

    await expect(
      // @ts-expect-error the template requires `readingAge`.
      preparePrompt({ template, variables: {} }),
    ).rejects.toThrow(/needs a value for \{\{readingAge\}\}/);

    const rows = await database()
      .select({ id: promptTemplates.id })
      .from(promptTemplates)
      .where(eq(promptTemplates.identifier, template.identifier));

    expect(rows).toHaveLength(0);
  });

  it("refuses a body that changed without a version bump", async () => {
    trackTemplate("integration-drifted");

    await preparePrompt({
      template: definePromptTemplate({
        identifier: "integration-drifted",
        template: "The original body.",
        version: 1,
      }),
      variables: {},
    });

    await expect(
      preparePrompt({
        template: definePromptTemplate({
          identifier: "integration-drifted",
          template: "An edited body.",
          version: 1,
        }),
        variables: {},
      }),
    ).rejects.toThrow(/is already stored with a different body. Bump its version./);
  });
});
