"use client";

import {
  getResourceAdapterCapabilities,
  ResourceAdapterApiError,
  ResourceAdapterButton,
  ResourceAdapterDialog,
  type LessonContext,
  type ResourceAdapterCapability,
} from "@oaknational/resource-adapter";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { OakPrimaryButton, OakSecondaryButton } from "@oaknational/oak-components";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useCallback, useEffect, useState } from "react";

import styles from "./page.module.css";

const log = raLogger("harness");

const lesson: LessonContext = {
  lessonSlug: "adding-fractions",
  programmeSlug: "ks2-maths",
  title: "Adding fractions",
  subjectSlug: "maths",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"],
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_RESOURCE_ADAPTER_API_BASE_URL ?? "http://localhost:3001";
const trpcEndpoint =
  process.env.NEXT_PUBLIC_RESOURCE_ADAPTER_TRPC_ENDPOINT ??
  "http://localhost:3001/trpc/v1";

type ApiHealthState = "checking" | "healthy" | "unavailable";
type TestJobStatus = "FAILED" | "QUEUED" | "RUNNING" | "SUCCEEDED";
type TestJobResponse = {
  failure: { message: string } | null;
  id: string;
  status: TestJobStatus;
};

const apiHealthLabels: Record<ApiHealthState, string> = {
  checking: "Checking",
  healthy: "Healthy",
  unavailable: "Unavailable",
};

const testJobStatusLabels: Record<TestJobStatus, string> = {
  FAILED: "Failed",
  QUEUED: "Queued",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
};

export default function HarnessPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [capabilities, setCapabilities] = useState<
    readonly ResourceAdapterCapability[]
  >([]);
  const [capabilitiesState, setCapabilitiesState] = useState<
    "error" | "loading" | "ready" | "signedOut"
  >("loading");
  const [apiHealthState, setApiHealthState] = useState<ApiHealthState>("checking");
  const [isResourceAdapterOpen, setIsResourceAdapterOpen] = useState(false);
  const [isCreatingTestJob, setIsCreatingTestJob] = useState(false);
  const [testJob, setTestJob] = useState<TestJobResponse | null>(null);
  const [testJobError, setTestJobError] = useState<string | null>(null);

  const loadCapabilities = useCallback(async () => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setCapabilities([]);
      setCapabilitiesState("signedOut");
      return;
    }

    setCapabilitiesState("loading");
    log.info("Loading capabilities for lesson %s", lesson.lessonSlug);

    try {
      const response = await getResourceAdapterCapabilities({
        getToken,
        lesson,
        trpcEndpoint,
      });

      setCapabilities(response.capabilities);
      setCapabilitiesState("ready");
      log.info("Loaded %d capabilities", response.capabilities.length);
    } catch (error: unknown) {
      setCapabilities([]);

      if (error instanceof ResourceAdapterApiError && error.status === 401) {
        setCapabilitiesState("signedOut");
        return;
      }

      log.error(error);
      setCapabilitiesState("error");
    }
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    void loadCapabilities();
  }, [loadCapabilities]);

  useEffect(() => {
    let isMounted = true;

    async function loadHealth() {
      try {
        const response = await fetch(new URL("/health", apiBaseUrl));
        const body: unknown = await response.json();
        const isHealthy =
          response.ok &&
          typeof body === "object" &&
          body !== null &&
          "status" in body &&
          body.status === "ok";

        if (isMounted) {
          setApiHealthState(isHealthy ? "healthy" : "unavailable");
        }
      } catch {
        if (isMounted) {
          setApiHealthState("unavailable");
        }
      }
    }

    void loadHealth();

    return () => {
      isMounted = false;
    };
  }, []);

  const runWorkerSmokeTest = useCallback(async () => {
    setIsCreatingTestJob(true);
    setTestJob(null);
    setTestJobError(null);

    try {
      const response = await fetch(new URL("/dev/jobs/test-echo", apiBaseUrl), {
        body: JSON.stringify({ message: "Hello from the harness" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`The API returned HTTP ${response.status}.`);
      }

      setTestJob((await response.json()) as TestJobResponse);
    } catch (error) {
      log.error(error);
      setTestJobError("Could not create the test job.");
    } finally {
      setIsCreatingTestJob(false);
    }
  }, []);

  const testJobIsActive = testJob?.status === "QUEUED" || testJob?.status === "RUNNING";

  useEffect(() => {
    if (!testJob || !testJobIsActive) {
      return;
    }

    const controller = new AbortController();
    const testJobId = testJob.id;
    let requestInFlight = false;

    async function pollJob() {
      if (requestInFlight) {
        return;
      }

      requestInFlight = true;

      try {
        const response = await fetch(new URL(`/dev/jobs/${testJobId}`, apiBaseUrl), {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`The API returned HTTP ${response.status}.`);
        }

        setTestJob((await response.json()) as TestJobResponse);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        log.error(error);
        setTestJob(null);
        setTestJobError("Could not read the test job status.");
      } finally {
        requestInFlight = false;
      }
    }

    void pollJob();
    const interval = window.setInterval(() => void pollJob(), 500);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [testJob?.id, testJobIsActive]);

  let testJobStatus = "Not run";
  if (isCreatingTestJob) {
    testJobStatus = "Creating";
  } else if (testJobError) {
    testJobStatus = testJobError;
  } else if (testJob) {
    testJobStatus = testJobStatusLabels[testJob.status];
    if (testJob.failure?.message) {
      testJobStatus += `: ${testJob.failure.message}`;
    }
  }

  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to lesson content
      </a>
      <header className={styles.header}>
        <p className={styles.brand}>Oak National Academy</p>
        <p className={styles.harnessLabel}>Resource Adapter harness</p>
        <p className={`${styles.apiHealth} ${styles[apiHealthState]}`} role="status">
          <span aria-hidden="true" className={styles.healthDot} />
          API /health: {apiHealthLabels[apiHealthState]}
        </p>
        {isSignedIn ? <UserButton /> : <SignInButton mode="modal" />}
        <nav aria-label="Lesson navigation">
          <a href="#lesson">Lesson</a>
        </nav>
      </header>
      <main className={styles.main} id="main-content">
        <article className={styles.lesson} id="lesson">
          <p className={styles.eyebrow}>Key stage 2 · Maths</p>
          <h1>{lesson.title}</h1>
          <p>
            This is a representative lesson page used to develop and verify the Resource
            Adapter package without running OWA locally.
          </p>
          <section aria-labelledby="worksheet-heading" className={styles.worksheet}>
            <h2 id="worksheet-heading">Worksheet</h2>
            <p>A worksheet is available for this lesson.</p>
          </section>
          <section aria-labelledby="worker-test-heading" className={styles.workerTest}>
            <h2 id="worker-test-heading">Background worker test</h2>
            <div className={styles.workerTestControls}>
              <button
                className={styles.workerTestButton}
                disabled={isCreatingTestJob || testJobIsActive}
                onClick={() => void runWorkerSmokeTest()}
                type="button"
              >
                Run test job
              </button>
              <p aria-live="polite" className={styles.workerTestStatus}>
                Status: {testJobStatus}
              </p>
            </div>
          </section>
          {capabilities.length > 0 && (
            <section
              aria-labelledby="create-more-heading"
              className={styles.createMore}
            >
              <h2 id="create-more-heading">Create more with Aila</h2>
              <p>Use AI to adapt this lesson&apos;s available resources.</p>

              <ResourceAdapterButton onClick={() => setIsResourceAdapterOpen(true)} />
            </section>
          )}
          {capabilitiesState === "signedOut" && (
            <section
              aria-labelledby="resource-adapter-sign-in-heading"
              className={styles.createMore}
            >
              <h2 id="resource-adapter-sign-in-heading">
                Sign in to create more with Aila
              </h2>
              <p>
                Adapting this lesson&apos;s resources with AI is available to signed-in
                teachers.
              </p>
              <SignInButton mode="modal">
                <OakPrimaryButton>Sign in</OakPrimaryButton>
              </SignInButton>
            </section>
          )}
          {capabilitiesState === "error" && (
            <section
              aria-labelledby="resource-adapter-unavailable-heading"
              className={styles.createMore}
            >
              <h2 id="resource-adapter-unavailable-heading">
                Create more with Aila is unavailable
              </h2>
              <p>The harness could not load Resource Adapter capabilities.</p>
              <OakSecondaryButton onClick={() => void loadCapabilities()}>
                Try again
              </OakSecondaryButton>
            </section>
          )}
        </article>
        <ResourceAdapterDialog
          capabilities={capabilities}
          isOpen={isResourceAdapterOpen}
          lesson={lesson}
          onClose={() => setIsResourceAdapterOpen(false)}
        />
      </main>
    </>
  );
}
