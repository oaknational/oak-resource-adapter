import { randomUUID } from "node:crypto";

import {
  adaptations,
  getDatabaseClient,
  JobStatus,
  jobs,
  resourceDocuments,
} from "@oaknational/resource-adapter-db";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import type { ResourceDocument } from "@oaknational/resource-document";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createOrGetJob, failJob } from "../jobs/job-repository";
import { adaptationHeadConcurrencyKey } from "./capability";
import {
  acceptSuggestion,
  createAdaptationWithSourceDocument,
  isAttemptComplete,
  findResumableAdaptation,
  getAdaptationHead,
  getLatestJobForConcurrencyKey,
  getOpenSuggestion,
  createOperationAttempt,
  listOpenSuggestions,
  replaceAdaptationWithSourceDocument,
  storeOutputsAndAdvanceHead,
  completeSuggestionAttempt,
} from "./repository";

const describeWithDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const lessonReference = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
} as const;

const lesson = {
  ...lessonReference,
  availableResources: ["worksheet"],
  keyStageSlug: "ks2",
  subjectSlug: "english",
  title: "Adopting different perspectives",
} as const;

describeWithDatabase("worksheet scaffolding repository integration", () => {
  const createdAdaptationIds: string[] = [];
  let worksheet: ResourceDocument;

  beforeAll(async () => {
    worksheet = await originalResourceDocuments.get({
      ...lessonReference,
      resourceType: "worksheet",
      source: "oak",
    });
  });

  afterEach(async () => {
    const ids = createdAdaptationIds.splice(0);
    if (ids.length > 0) {
      await getDatabaseClient().delete(adaptations).where(inArray(adaptations.id, ids));
    }
  });

  async function newAdaptation() {
    const teacherId = `integration-${randomUUID()}`;
    const created = await createAdaptationWithSourceDocument({
      capabilityId: "worksheetScaffolding",
      document: worksheet,
      lesson,
      teacherId,
    });
    createdAdaptationIds.push(created.adaptationId);
    return { ...created, teacherId };
  }

  async function newAttempt(adaptationId: string, resourceDocumentId: string) {
    const job = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: { adaptationId, flowId: "worksheet-scaffolding", resourceDocumentId },
      kind: "suggestions.generate",
    });
    const attempt = await createOperationAttempt({
      adaptationId,
      idempotencyKey: `integration-${randomUUID()}`,
      jobId: job.job.id,
      kind: "suggestions.worksheet-scaffolding",
      resourceDocumentId,
    });
    return { attempt, jobId: job.job.id };
  }

  it("points a new adaptation's head at the worksheet it stored", async () => {
    const { adaptationId, resourceDocumentId, teacherId } = await newAdaptation();

    const head = await getAdaptationHead(adaptationId, teacherId);

    expect(head?.storedDocument.id).toBe(resourceDocumentId);
    await expect(getAdaptationHead(adaptationId, "someone-else")).resolves.toBeNull();
  });

  it("reads back stored offers in the order they were generated", async () => {
    const { adaptationId, resourceDocumentId } = await newAdaptation();
    const { attempt } = await newAttempt(adaptationId, resourceDocumentId);

    await completeSuggestionAttempt({
      attemptId: attempt.id,
      resourceDocumentId: resourceDocumentId,
      suggestions: [
        {
          kind: "scaffold-add-word-bank",
          params: { supportLevel: "low" },
          reason: "The first offer.",
          targetBlockId: null,
        },
        {
          kind: "scaffold-add-glossary-question",
          params: { supportLevel: "low" },
          reason: "The second offer.",
          targetBlockId: null,
        },
      ],
    });

    await expect(listOpenSuggestions(resourceDocumentId)).resolves.toMatchObject([
      { position: 0, reason: "The first offer." },
      { position: 1, reason: "The second offer." },
    ]);
  });

  it("stores an empty suggestion result durably", async () => {
    const { adaptationId, resourceDocumentId } = await newAdaptation();
    const { attempt } = await newAttempt(adaptationId, resourceDocumentId);

    await completeSuggestionAttempt({
      attemptId: attempt.id,
      resourceDocumentId: resourceDocumentId,
      suggestions: [],
    });

    await expect(isAttemptComplete(attempt.id)).resolves.toBe(true);
    await expect(listOpenSuggestions(resourceDocumentId)).resolves.toEqual([]);
  });

  it("lets only one request accept an offer", async () => {
    const { adaptationId, resourceDocumentId } = await newAdaptation();
    const { attempt } = await newAttempt(adaptationId, resourceDocumentId);
    await completeSuggestionAttempt({
      attemptId: attempt.id,
      resourceDocumentId: resourceDocumentId,
      suggestions: [
        {
          kind: "scaffold-add-word-bank",
          params: { supportLevel: "low" },
          reason: "The only offer.",
          targetBlockId: null,
        },
      ],
    });
    const [suggestion] = await listOpenSuggestions(resourceDocumentId);
    if (suggestion === undefined) {
      throw new Error("The offer was not stored.");
    }
    const head = await getAdaptationHead(adaptationId);
    if (head === null) {
      throw new Error("The adaptation head is missing.");
    }

    const accept = async () => {
      const job = await createOrGetJob({
        idempotencyKey: `integration-${randomUUID()}`,
        input: {
          adaptationId,
          params: {},
          resourceDocumentId,
          suggestionId: suggestion.id,
        },
        kind: "suggestions.apply",
      });
      return acceptSuggestion({
        adaptationId,
        head,
        idempotencyKey: `integration-${randomUUID()}`,
        jobId: job.job.id,
        params: { supportLevel: "low" },
        suggestion,
      });
    };

    await expect(accept()).resolves.toMatchObject({
      suggestion: { id: suggestion.id },
    });
    await expect(accept()).rejects.toThrow("accepted by another request");
    await expect(
      getOpenSuggestion(suggestion.id, resourceDocumentId),
    ).resolves.toBeNull();
  });

  it("advances the head only while it still points at the consumed document", async () => {
    const { adaptationId, resourceDocumentId } = await newAdaptation();
    const { attempt } = await newAttempt(adaptationId, resourceDocumentId);

    const nextHeadId = await storeOutputsAndAdvanceHead({
      adaptationId,
      attemptId: attempt.id,
      expectedHeadId: resourceDocumentId,
      outputs: [{ document: worksheet, purpose: "revised-resource" }],
      revisedPosition: 0,
    });

    await expect(getAdaptationHead(adaptationId)).resolves.toMatchObject({
      storedDocument: { id: nextHeadId },
    });

    const { attempt: second } = await newAttempt(adaptationId, nextHeadId);
    await expect(
      storeOutputsAndAdvanceHead({
        adaptationId,
        attemptId: second.id,
        expectedHeadId: resourceDocumentId,
        outputs: [{ document: worksheet, purpose: "revised-resource" }],
        revisedPosition: 0,
      }),
    ).rejects.toThrow("head changed");
  });

  it("prefers a job still in flight over a finished one", async () => {
    const { adaptationId, resourceDocumentId } = await newAdaptation();
    const kinds = ["suggestions.apply", "suggestions.generate"] as const;
    const concurrencyKey = adaptationHeadConcurrencyKey(
      adaptationId,
      resourceDocumentId,
    );

    const finished = await createOrGetJob({
      concurrencyKey,
      idempotencyKey: `integration-${randomUUID()}`,
      input: { adaptationId, flowId: "worksheet-scaffolding", resourceDocumentId },
      kind: "suggestions.generate",
    });
    await failJob(finished.job.id, null, {
      code: "test_failure",
      message: "The earlier job finished.",
    });
    const queued = await createOrGetJob({
      concurrencyKey,
      idempotencyKey: `integration-${randomUUID()}`,
      input: { adaptationId, flowId: "worksheet-scaffolding", resourceDocumentId },
      kind: "suggestions.generate",
    });
    const otherResourceDocumentId = randomUUID();
    await createOrGetJob({
      concurrencyKey: adaptationHeadConcurrencyKey(
        adaptationId,
        otherResourceDocumentId,
      ),
      idempotencyKey: `integration-${randomUUID()}`,
      input: {
        adaptationId,
        flowId: "worksheet-scaffolding",
        resourceDocumentId: otherResourceDocumentId,
      },
      kind: "suggestions.generate",
    });
    const other = await createAdaptationWithSourceDocument({
      capabilityId: "worksheetScaffolding",
      document: worksheet,
      lesson,
      teacherId: `integration-${randomUUID()}`,
    });
    createdAdaptationIds.push(other.adaptationId);
    await createOrGetJob({
      concurrencyKey: adaptationHeadConcurrencyKey(
        other.adaptationId,
        other.resourceDocumentId,
      ),
      idempotencyKey: `integration-${randomUUID()}`,
      input: {
        adaptationId: other.adaptationId,
        flowId: "worksheet-scaffolding",
        resourceDocumentId: other.resourceDocumentId,
      },
      kind: "suggestions.generate",
    });

    await expect(
      getLatestJobForConcurrencyKey(concurrencyKey, kinds),
    ).resolves.toMatchObject({ id: queued.job.id });
  });

  describe("resumable work", () => {
    const OPERATION_KIND = "suggestions.worksheet-scaffolding";

    function resumableQuery(teacherId: string) {
      return {
        capabilityId: "worksheetScaffolding",
        lesson,
        notBefore: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        operationKind: OPERATION_KIND,
        teacherId,
      };
    }

    /** Mirrors a real acceptance: an offer, a teacher-facing transformation, a new head. */
    async function withAppliedScaffold() {
      const created = await newAdaptation();
      const { attempt } = await newAttempt(
        created.adaptationId,
        created.resourceDocumentId,
      );
      await completeSuggestionAttempt({
        attemptId: attempt.id,
        resourceDocumentId: created.resourceDocumentId,
        suggestions: [
          {
            kind: "scaffold-add-word-bank",
            params: { supportLevel: "low" },
            reason: "The offer the teacher accepted.",
            targetBlockId: null,
          },
        ],
      });
      const [suggestion] = await listOpenSuggestions(created.resourceDocumentId);
      const head = await getAdaptationHead(created.adaptationId);
      if (suggestion === undefined || head === null) {
        throw new Error("The adaptation was not set up.");
      }
      const applyJob = await createOrGetJob({
        idempotencyKey: `integration-${randomUUID()}`,
        input: {
          adaptationId: created.adaptationId,
          params: {},
          resourceDocumentId: created.resourceDocumentId,
          suggestionId: suggestion.id,
        },
        kind: "suggestions.apply",
      });
      const accepted = await acceptSuggestion({
        adaptationId: created.adaptationId,
        head,
        idempotencyKey: `integration-${randomUUID()}`,
        jobId: applyJob.job.id,
        params: { supportLevel: "low" },
        suggestion,
      });
      await storeOutputsAndAdvanceHead({
        adaptationId: created.adaptationId,
        attemptId: accepted.attempt.id,
        expectedHeadId: created.resourceDocumentId,
        outputs: [{ document: worksheet, purpose: "revised-resource" }],
        revisedPosition: 0,
      });
      await getDatabaseClient()
        .update(jobs)
        .set({ status: JobStatus.SUCCEEDED })
        .where(eq(jobs.id, applyJob.job.id));
      return created;
    }

    it("ignores an adaptation the teacher never changed", async () => {
      const { teacherId } = await newAdaptation();

      await expect(
        findResumableAdaptation(resumableQuery(teacherId)),
      ).resolves.toBeNull();
    });

    it("offers an adaptation whose head is a generated worksheet", async () => {
      const { adaptationId, teacherId } = await withAppliedScaffold();

      await expect(
        findResumableAdaptation(resumableQuery(teacherId)),
      ).resolves.toMatchObject({ id: adaptationId });
    });

    it("stops offering work the teacher replaced", async () => {
      const { adaptationId, teacherId } = await withAppliedScaffold();

      const replacement = await replaceAdaptationWithSourceDocument({
        capabilityId: "worksheetScaffolding",
        document: worksheet,
        lesson,
        replacingAdaptationId: adaptationId,
        teacherId,
      });
      createdAdaptationIds.push(replacement.adaptationId);

      await expect(
        findResumableAdaptation(resumableQuery(teacherId)),
      ).resolves.toBeNull();
    });

    it("refuses to replace work a second time", async () => {
      const { adaptationId, teacherId } = await withAppliedScaffold();
      const replace = () =>
        replaceAdaptationWithSourceDocument({
          capabilityId: "worksheetScaffolding",
          document: worksheet,
          lesson,
          replacingAdaptationId: adaptationId,
          teacherId,
        });

      const first = await replace();
      createdAdaptationIds.push(first.adaptationId);

      await expect(replace()).rejects.toThrow("could not be replaced");
    });

    it("does not offer one teacher's work to another", async () => {
      await withAppliedScaffold();

      await expect(
        findResumableAdaptation(resumableQuery(`integration-${randomUUID()}`)),
      ).resolves.toBeNull();
    });

    it("does not offer work older than the window", async () => {
      const { teacherId } = await withAppliedScaffold();

      await expect(
        findResumableAdaptation({
          ...resumableQuery(teacherId),
          notBefore: new Date(Date.now() + 60_000),
        }),
      ).resolves.toBeNull();
    });

    it("counts the scaffolds the teacher applied, not the suggestion runs", async () => {
      const { adaptationId, teacherId } = await withAppliedScaffold();

      const offered = await findResumableAdaptation(resumableQuery(teacherId));

      expect(offered).toMatchObject({ id: adaptationId, scaffoldCount: 1 });
    });
  });

  it("replaces old work and stores the new worksheet atomically", async () => {
    const previous = await newAdaptation();

    const replacement = await replaceAdaptationWithSourceDocument({
      capabilityId: "worksheetScaffolding",
      document: worksheet,
      lesson,
      replacingAdaptationId: previous.adaptationId,
      teacherId: previous.teacherId,
    });
    createdAdaptationIds.push(replacement.adaptationId);

    await expect(getAdaptationHead(replacement.adaptationId)).resolves.toMatchObject({
      storedDocument: { id: replacement.resourceDocumentId },
    });
    const [old] = await getDatabaseClient()
      .select({ abandonedAt: adaptations.abandonedAt })
      .from(adaptations)
      .where(eq(adaptations.id, previous.adaptationId));
    expect(old?.abandonedAt).toBeInstanceOf(Date);
  });

  it("refuses to replace work from another capability or lesson", async () => {
    const previous = await newAdaptation();
    const replace = (overrides: { capabilityId?: string; lesson?: LessonContext }) =>
      replaceAdaptationWithSourceDocument({
        capabilityId: overrides.capabilityId ?? "worksheetScaffolding",
        document: worksheet,
        lesson: overrides.lesson ?? lesson,
        replacingAdaptationId: previous.adaptationId,
        teacherId: previous.teacherId,
      });

    await expect(replace({ capabilityId: "anotherCapability" })).rejects.toThrow(
      "could not be replaced",
    );
    await expect(
      replace({ lesson: { ...lesson, lessonSlug: "another-lesson" } }),
    ).rejects.toThrow("could not be replaced");

    const [old] = await getDatabaseClient()
      .select({ abandonedAt: adaptations.abandonedAt })
      .from(adaptations)
      .where(eq(adaptations.id, previous.adaptationId));
    expect(old?.abandonedAt).toBeNull();
  });

  it("returns no head once the adaptation's document is gone", async () => {
    const { adaptationId, resourceDocumentId } = await newAdaptation();

    await getDatabaseClient()
      .update(adaptations)
      .set({ headResourceDocumentId: null })
      .where(eq(adaptations.id, adaptationId));
    await getDatabaseClient()
      .delete(resourceDocuments)
      .where(eq(resourceDocuments.id, resourceDocumentId));

    await expect(getAdaptationHead(adaptationId)).resolves.toBeNull();
  });
});
