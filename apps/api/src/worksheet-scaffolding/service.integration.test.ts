import { randomUUID } from "node:crypto";

import {
  adaptations,
  getDatabaseClient,
  JobStatus,
  jobs,
} from "@oaknational/resource-adapter-db";
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { enqueueJob } from "../jobs/enqueue-job";
import {
  createOrGetJob,
  failJob,
  findExistingJob,
  getLatestJobForConcurrencyKey,
  recordWorkflowRun,
} from "../jobs/job-repository";
import {
  createModelJobLimiter,
  modelJobsPer24hLimit,
  type UsageLimiter,
} from "../usage/limiter";
import { adaptedResourcesSince } from "../usage/adaptation-allowance";
import { modelJobLimitRetryAt } from "../usage/repository";
import { adaptationHeadConcurrencyKey } from "./capability";
import type { WorksheetScaffoldingDependencies } from "./dependencies";
import * as repository from "./repository";
import { enqueueSuggestionApplication, getWorksheetScaffoldingState } from "./service";

const describeWithDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const lessonReference = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
} as const;

const fullAccess = () =>
  Promise.resolve({
    onboarded: true,
    termsAccepted: true,
    tier: "full",
    inCopyrightRegion: true,
  } as const);
const access = { recheck: fullAccess, resolve: fullAccess };

const limitOfOne = createModelJobLimiter({
  access,
  limit: () => 1,
  retryAt: modelJobLimitRetryAt,
});

function countedJobs(teacherId: string) {
  return getDatabaseClient()
    .select()
    .from(jobs)
    .where(eq(jobs.countsAgainstClerkUserId, teacherId));
}

describeWithDatabase("worksheet scaffolding service integration", () => {
  const createdAdaptationIds: string[] = [];
  const teacherIds: string[] = [];

  afterEach(async () => {
    const ids = createdAdaptationIds.splice(0);
    if (ids.length > 0) {
      await getDatabaseClient().delete(adaptations).where(inArray(adaptations.id, ids));
    }
    const teachers = teacherIds.splice(0);
    if (teachers.length > 0) {
      await getDatabaseClient()
        .delete(jobs)
        .where(inArray(jobs.countsAgainstClerkUserId, teachers));
    }
  });

  async function newAdaptation() {
    const worksheet = await originalResourceDocuments.get({
      ...lessonReference,
      resourceType: "worksheet",
      source: "oak",
    });
    const teacherId = `integration-${randomUUID()}`;
    teacherIds.push(teacherId);
    const created = await repository.createAdaptationWithSourceDocument({
      allowance: "unlimited",
      capabilityId: "worksheetScaffolding",
      document: worksheet,
      lesson: {
        ...lessonReference,
        availableResources: ["worksheet"],
        keyStageSlug: "ks2",
        subjectSlug: "english",
        title: "Adopting different perspectives",
      },
      teacherId,
    });
    if (created.outcome !== "created") {
      throw new Error("An unlimited allowance always creates the adaptation.");
    }
    const { adaptationId, resourceDocumentId } = created;
    createdAdaptationIds.push(adaptationId);
    return {
      adaptationId,
      resourceDocumentId,
      teacher: { organisationId: null, teacherId },
    };
  }

  async function newOpenSuggestion() {
    const { adaptationId, resourceDocumentId, teacher } = await newAdaptation();
    const generation = await createOrGetJob({
      idempotencyKey: `integration-${randomUUID()}`,
      input: { adaptationId, flowId: "worksheet-scaffolding", resourceDocumentId },
      kind: "suggestions.generate",
    });
    const attempt = await repository.createOperationAttempt({
      adaptationId,
      idempotencyKey: `integration-${randomUUID()}`,
      jobId: generation.job.id,
      kind: "suggestions.worksheet-scaffolding",
      resourceDocumentId,
    });
    await repository.completeSuggestionAttempt({
      attemptId: attempt.id,
      resourceDocumentId,
      suggestions: [
        {
          inputs: [],
          kind: "scaffold-add-word-bank",
          params: { supportLevel: "low" },
          reason: "Vocabulary support would help here.",
          targetBlockId: null,
        },
      ],
    });
    const [suggestion] = await repository.listOpenSuggestions(resourceDocumentId);
    if (suggestion === undefined) {
      throw new Error("The open suggestion fixture could not be created.");
    }
    return {
      adaptationId,
      resourceDocumentId,
      suggestionId: suggestion.id,
      teacher,
    };
  }

  function dependencies(
    startWorkflow: (jobId: string) => Promise<{ runId: string }>,
    usage: UsageLimiter = createModelJobLimiter({
      access,
      limit: () => modelJobsPer24hLimit(process.env.USAGE_LIMIT_MODEL_JOBS_PER_24H),
      retryAt: modelJobLimitRetryAt,
    }),
  ): WorksheetScaffoldingDependencies {
    return {
      access,
      adaptedResourcesPerMonth: () => 3,
      adaptedResourcesSince,
      enqueue: ((request) =>
        enqueueJob(request, {
          createOrGet: createOrGetJob,
          findExisting: findExistingJob,
          markDispatchFailed: failJob,
          recordRun: recordWorkflowRun,
          startWorkflow,
          usage,
        })) as typeof enqueueJob,
      getLatestJob: getLatestJobForConcurrencyKey,
      now: () => new Date(),
      admitToCapability: () => {
        throw new Error("These requests do not check lesson eligibility.");
      },
      readSourceDocument: () => {
        throw new Error("These requests do not read the source document.");
      },
      repository,
      resumableCutoff: () => new Date(0),
    };
  }

  const dispatches = async () => ({ runId: `run-${randomUUID()}` });

  it("returns a replayed application at the limit rather than refusing or counting it", async () => {
    const { adaptationId, suggestionId, teacher } = await newOpenSuggestion();
    const apply = () =>
      enqueueSuggestionApplication(
        { adaptationId, suggestionId },
        teacher,
        dependencies(dispatches, limitOfOne),
      );

    await expect(apply()).resolves.toMatchObject({ modelWorkBlocked: null });
    await expect(apply()).resolves.toMatchObject({ modelWorkBlocked: null });

    await expect(countedJobs(teacher.teacherId)).resolves.toHaveLength(1);
  });

  it("refuses suggestions at the limit without a job, then generates once the window passes", async () => {
    const { adaptationId, resourceDocumentId, teacher } = await newAdaptation();
    const [earlier] = await getDatabaseClient()
      .insert(jobs)
      .values({
        countsAgainstClerkUserId: teacher.teacherId,
        idempotencyKey: `integration-${randomUUID()}`,
        input: { message: "earlier model work" },
        kind: "test.echo",
        status: JobStatus.SUCCEEDED,
      })
      .returning({ id: jobs.id });
    const read = () =>
      getWorksheetScaffoldingState(
        adaptationId,
        teacher,
        dependencies(dispatches, limitOfOne),
      );

    await expect(read()).resolves.toMatchObject({
      modelWorkBlocked: { kind: "model_jobs_24h" },
      job: null,
    });
    await expect(countedJobs(teacher.teacherId)).resolves.toHaveLength(1);

    await getDatabaseClient()
      .update(jobs)
      .set({ createdAt: sql`now() - interval '25 hours'` })
      .where(eq(jobs.id, earlier?.id ?? ""));

    await expect(read()).resolves.toMatchObject({
      modelWorkBlocked: null,
      job: { kind: "suggestions.generate" },
    });
    await expect(countedJobs(teacher.teacherId)).resolves.toContainEqual(
      expect.objectContaining({
        concurrencyKey: adaptationHeadConcurrencyKey(adaptationId, resourceDocumentId),
      }),
    );
  });
});
