import { randomUUID } from "node:crypto";

import {
  adaptations,
  getDatabaseClient,
  JobStatus,
  jobs,
  resourceDocuments,
  transformationAttempts,
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
  acceptPendingReview,
  createAdaptationWithSourceDocument,
  createRetryAttempt,
  isAttemptComplete,
  findResumableAdaptation,
  getAdaptationHead,
  getLatestJobForConcurrencyKey,
  getOpenSuggestion,
  getPendingReview,
  getPrimaryTransformationInput,
  createOperationAttempt,
  isAcceptedContribution,
  listOpenSuggestions,
  replaceAdaptationWithSourceDocument,
  storeOutputsAndAdvanceHead,
  completeSuggestionAttempt,
  undoPendingReview,
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

  /** An adaptation whose head is a generated revision awaiting the teacher's decision. */
  async function newPendingReview() {
    const { adaptationId, resourceDocumentId } = await newAdaptation();
    const { attempt: suggestionAttempt } = await newAttempt(
      adaptationId,
      resourceDocumentId,
    );
    await completeSuggestionAttempt({
      attemptId: suggestionAttempt.id,
      resourceDocumentId,
      suggestions: [
        {
          kind: "scaffold-add-word-bank",
          params: { supportLevel: "low" },
          reason: "Vocabulary support would help here.",
          targetBlockId: null,
        },
      ],
    });
    const [suggestion] = await listOpenSuggestions(resourceDocumentId);
    const currentHead = await getAdaptationHead(adaptationId);
    if (suggestion === undefined || currentHead === null) {
      throw new Error("The pending-review fixture could not be created.");
    }
    const applicationJob = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: {
        adaptationId,
        params: {},
        resourceDocumentId,
        suggestionId: suggestion.id,
      },
      kind: "suggestions.apply",
    });
    const accepted = await acceptSuggestion({
      adaptationId,
      head: currentHead,
      idempotencyKey: `integration-${randomUUID()}`,
      jobId: applicationJob.job.id,
      params: { supportLevel: "low" },
      suggestion,
    });
    const pendingHeadId = await storeOutputsAndAdvanceHead({
      adaptationId,
      attemptId: accepted.attempt.id,
      expectedHeadId: resourceDocumentId,
      outputs: [{ document: worksheet, purpose: "revised-resource" }],
      revisedPosition: 0,
    });
    return { accepted, adaptationId, pendingHeadId, resourceDocumentId, suggestion };
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
          kind: "scaffold-chunk-tasks",
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

  it("does not advance an adaptation with another adaptation's attempt", async () => {
    const first = await newAdaptation();
    const second = await newAdaptation();
    const { attempt } = await newAttempt(
      second.adaptationId,
      second.resourceDocumentId,
    );

    await expect(
      storeOutputsAndAdvanceHead({
        adaptationId: first.adaptationId,
        attemptId: attempt.id,
        expectedHeadId: first.resourceDocumentId,
        outputs: [{ document: worksheet, purpose: "revised-resource" }],
        revisedPosition: 0,
      }),
    ).rejects.toThrow("head changed");
    await expect(getAdaptationHead(first.adaptationId)).resolves.toMatchObject({
      storedDocument: { id: first.resourceDocumentId },
    });
  });

  it("reports the head's unaccepted attempt as awaiting a decision", async () => {
    const { accepted, adaptationId, pendingHeadId, resourceDocumentId } =
      await newPendingReview();

    await expect(getPendingReview(pendingHeadId)).resolves.toMatchObject({
      attempt: { acceptedAt: null, id: accepted.attempt.id },
      suggestion: { reason: "Vocabulary support would help here." },
      transformation: { id: accepted.transformation.id },
    });
    await expect(
      isAcceptedContribution(adaptationId, accepted.transformation.id),
    ).resolves.toBe(false);
    await expect(
      getPrimaryTransformationInput(accepted.transformation.id),
    ).resolves.toMatchObject({ id: resourceDocumentId });
  });

  it("numbers a retry after the attempt it follows", async () => {
    const { accepted, adaptationId, pendingHeadId } = await newPendingReview();
    const retryJob = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: {
        adaptationId,
        attemptId: accepted.attempt.id,
        resourceDocumentId: pendingHeadId,
      },
      kind: "transformations.retry",
    });

    await expect(
      createRetryAttempt({
        jobId: retryJob.job.id,
        transformationId: accepted.transformation.id,
      }),
    ).resolves.toMatchObject({ attemptNumber: 2 });
  });

  it("resolves a redelivered retry job to the attempt it already created", async () => {
    const { accepted, adaptationId, pendingHeadId } = await newPendingReview();
    const retryJob = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: {
        adaptationId,
        attemptId: accepted.attempt.id,
        resourceDocumentId: pendingHeadId,
      },
      kind: "transformations.retry",
    });
    const request = {
      jobId: retryJob.job.id,
      transformationId: accepted.transformation.id,
    };

    const first = await createRetryAttempt(request);

    await expect(createRetryAttempt(request)).resolves.toMatchObject({ id: first.id });
  });

  it("stamps acceptance on the attempt that still owns the head", async () => {
    const { accepted, adaptationId, pendingHeadId } = await newPendingReview();

    await expect(
      acceptPendingReview({
        adaptationId,
        attemptId: accepted.attempt.id,
        expectedHeadId: pendingHeadId,
      }),
    ).resolves.toBe(true);
    await expect(getPendingReview(pendingHeadId)).resolves.toBeNull();
    const [acceptedAttempt] = await getDatabaseClient()
      .select({ acceptedAt: transformationAttempts.acceptedAt })
      .from(transformationAttempts)
      .where(eq(transformationAttempts.id, accepted.attempt.id));
    expect(acceptedAttempt?.acceptedAt).toBeInstanceOf(Date);
    await expect(
      isAcceptedContribution(adaptationId, accepted.transformation.id),
    ).resolves.toBe(true);
  });

  it("refuses to accept an attempt that no longer owns the head", async () => {
    const { accepted, adaptationId, resourceDocumentId } = await newPendingReview();

    await expect(
      acceptPendingReview({
        adaptationId,
        attemptId: accepted.attempt.id,
        expectedHeadId: resourceDocumentId,
      }),
    ).resolves.toBe(false);
  });

  it("refuses an attempt from another adaptation even when the expected head is current", async () => {
    const first = await newPendingReview();
    const second = await newPendingReview();

    await expect(
      acceptPendingReview({
        adaptationId: first.adaptationId,
        attemptId: second.accepted.attempt.id,
        expectedHeadId: first.pendingHeadId,
      }),
    ).resolves.toBe(false);
    await expect(getPendingReview(first.pendingHeadId)).resolves.not.toBeNull();
    await expect(getPendingReview(second.pendingHeadId)).resolves.not.toBeNull();
  });

  it("does not install a retry after its pending predecessor was accepted", async () => {
    const { accepted, adaptationId, pendingHeadId } = await newPendingReview();
    const retryJob = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: { adaptationId, attemptId: accepted.attempt.id },
      kind: "transformations.retry",
    });
    const retryAttempt = await createRetryAttempt({
      jobId: retryJob.job.id,
      transformationId: accepted.transformation.id,
    });
    await acceptPendingReview({
      adaptationId,
      attemptId: accepted.attempt.id,
      expectedHeadId: pendingHeadId,
    });

    await expect(
      storeOutputsAndAdvanceHead({
        adaptationId,
        attemptId: retryAttempt.id,
        expectedHeadId: pendingHeadId,
        expectedPendingAttemptId: accepted.attempt.id,
        outputs: [{ document: worksheet, purpose: "revised-resource" }],
        revisedPosition: 0,
      }),
    ).rejects.toThrow("head changed");
    await expect(getAdaptationHead(adaptationId)).resolves.toMatchObject({
      storedDocument: { id: pendingHeadId },
    });
  });

  it("moves undo back to the input and discards the generated work", async () => {
    const { accepted, adaptationId, pendingHeadId, resourceDocumentId, suggestion } =
      await newPendingReview();

    await expect(
      undoPendingReview({
        adaptationId,
        expectedHeadId: pendingHeadId,
        previousHeadId: resourceDocumentId,
        transformationId: accepted.transformation.id,
      }),
    ).resolves.toBe(true);

    await expect(getAdaptationHead(adaptationId)).resolves.toMatchObject({
      storedDocument: { id: resourceDocumentId },
    });
    const [reopened] = await listOpenSuggestions(resourceDocumentId);
    expect(reopened).toMatchObject({
      id: suggestion.id,
      reason: "Vocabulary support would help here.",
      undoCount: 1,
    });
    const [survivingDocument] = await getDatabaseClient()
      .select({ id: resourceDocuments.id })
      .from(resourceDocuments)
      .where(eq(resourceDocuments.id, pendingHeadId));
    expect(survivingDocument).toBeUndefined();
  });

  it("refuses to undo an attempt that no longer owns the head", async () => {
    const { accepted, adaptationId, resourceDocumentId } = await newPendingReview();

    await expect(
      undoPendingReview({
        adaptationId,
        expectedHeadId: resourceDocumentId,
        previousHeadId: resourceDocumentId,
        transformationId: accepted.transformation.id,
      }),
    ).resolves.toBe(false);
  });

  it("refuses to undo a transformation from another adaptation", async () => {
    const first = await newPendingReview();
    const second = await newPendingReview();

    await expect(
      undoPendingReview({
        adaptationId: first.adaptationId,
        expectedHeadId: first.pendingHeadId,
        previousHeadId: first.resourceDocumentId,
        transformationId: second.accepted.transformation.id,
      }),
    ).resolves.toBe(false);
    await expect(getAdaptationHead(first.adaptationId)).resolves.toMatchObject({
      storedDocument: { id: first.pendingHeadId },
    });
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
    function resumableQuery(teacherId: string) {
      return {
        capabilityId: "worksheetScaffolding",
        lesson,
        notBefore: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        teacherId,
      };
    }

    /** Mirrors application up to the point where the generated scaffold awaits review. */
    async function withPendingScaffold() {
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
        outputs: [
          {
            document: {
              ...worksheet,
              content: worksheet.content.map((node, index) =>
                index === 0
                  ? {
                      ...node,
                      extensions: {
                        ...node.extensions,
                        "oak:contribution": accepted.transformation.id,
                      },
                    }
                  : node,
              ),
            },
            purpose: "revised-resource",
          },
        ],
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

    it("offers an adaptation whose generated scaffold is awaiting review", async () => {
      const { adaptationId, teacherId } = await withPendingScaffold();

      await expect(
        findResumableAdaptation(resumableQuery(teacherId)),
      ).resolves.toMatchObject({ id: adaptationId });
    });

    it("stops offering work the teacher replaced", async () => {
      const { adaptationId, teacherId } = await withPendingScaffold();

      const replacement = await replaceAdaptationWithSourceDocument({
        capabilityId: "worksheetScaffolding",
        document: worksheet,
        lesson,
        replacingAdaptationId: adaptationId,
        replacementRequestId: randomUUID(),
        teacherId,
      });
      createdAdaptationIds.push(replacement.adaptationId);

      await expect(
        findResumableAdaptation(resumableQuery(teacherId)),
      ).resolves.toBeNull();
    });

    it("replays the same replacement request without creating another adaptation", async () => {
      const { adaptationId, teacherId } = await withPendingScaffold();
      const replacementRequestId = randomUUID();
      const replace = () =>
        replaceAdaptationWithSourceDocument({
          capabilityId: "worksheetScaffolding",
          document: worksheet,
          lesson,
          replacingAdaptationId: adaptationId,
          replacementRequestId,
          teacherId,
        });

      const first = await replace();
      createdAdaptationIds.push(first.adaptationId);

      await expect(replace()).resolves.toEqual(first);
    });

    it("refuses a second, distinct replacement of abandoned work", async () => {
      const { adaptationId, teacherId } = await withPendingScaffold();
      const replace = (replacementRequestId: string) =>
        replaceAdaptationWithSourceDocument({
          capabilityId: "worksheetScaffolding",
          document: worksheet,
          lesson,
          replacingAdaptationId: adaptationId,
          replacementRequestId,
          teacherId,
        });

      const first = await replace(randomUUID());
      createdAdaptationIds.push(first.adaptationId);

      await expect(replace(randomUUID())).rejects.toThrow("could not be replaced");
    });

    it("does not offer one teacher's work to another", async () => {
      await withPendingScaffold();

      await expect(
        findResumableAdaptation(resumableQuery(`integration-${randomUUID()}`)),
      ).resolves.toBeNull();
    });

    it("does not offer work older than the window", async () => {
      const { teacherId } = await withPendingScaffold();

      await expect(
        findResumableAdaptation({
          ...resumableQuery(teacherId),
          notBefore: new Date(Date.now() + 60_000),
        }),
      ).resolves.toBeNull();
    });

    it("counts present scaffolds and reports that the generated head is pending", async () => {
      const { adaptationId, teacherId } = await withPendingScaffold();

      const offered = await findResumableAdaptation(resumableQuery(teacherId));

      expect(offered).toMatchObject({
        id: adaptationId,
        pendingScaffoldCount: 1,
        scaffoldCount: 1,
      });
    });
  });

  it("replaces old work and stores the new worksheet atomically", async () => {
    const previous = await newAdaptation();

    const replacement = await replaceAdaptationWithSourceDocument({
      capabilityId: "worksheetScaffolding",
      document: worksheet,
      lesson,
      replacingAdaptationId: previous.adaptationId,
      replacementRequestId: randomUUID(),
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
        replacementRequestId: randomUUID(),
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
