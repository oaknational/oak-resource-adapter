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

import { ErrorBoundarySmokeTest } from "./ErrorBoundarySmokeTest";
import { fetchApiHealth, resolveApiBaseUrl } from "./harness-api";
import { ModelSmokeTest } from "./ModelSmokeTest";
import styles from "./page.module.css";
import { WorkerSmokeTest } from "./WorkerSmokeTest";

const log = raLogger("harness");

const lesson: LessonContext = {
  lessonSlug: "adding-fractions",
  programmeSlug: "maths-primary-ks2",
  title: "Adding fractions",
  subjectSlug: "maths",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"],
};

type ApiHealthState = "checking" | "healthy" | "unavailable";

const apiHealthLabels: Record<ApiHealthState, string> = {
  checking: "Checking",
  healthy: "Healthy",
  unavailable: "Unavailable",
};

export default function HarnessPage() {
  const apiBaseUrl = resolveApiBaseUrl();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [capabilities, setCapabilities] = useState<
    readonly ResourceAdapterCapability[]
  >([]);
  const [capabilitiesState, setCapabilitiesState] = useState<
    "error" | "loading" | "ready" | "signedOut"
  >("loading");
  const [apiHealthState, setApiHealthState] = useState<ApiHealthState>("checking");
  const [isResourceAdapterOpen, setIsResourceAdapterOpen] = useState(false);

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
      const capabilitiesResponse = await getResourceAdapterCapabilities({
        apiBaseUrl,
        getToken,
        lesson,
      });

      setCapabilities(capabilitiesResponse.capabilities);
      setCapabilitiesState("ready");
      log.info("Loaded %d capabilities", capabilitiesResponse.capabilities.length);
    } catch (error: unknown) {
      setCapabilities([]);

      if (error instanceof ResourceAdapterApiError && error.status === 401) {
        setCapabilitiesState("signedOut");
        return;
      }

      log.error(error);
      setCapabilitiesState("error");
    }
  }, [apiBaseUrl, getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    void loadCapabilities();
  }, [loadCapabilities]);

  useEffect(() => {
    let isMounted = true;

    async function loadHealth() {
      try {
        const isHealthy = await fetchApiHealth();

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
          <WorkerSmokeTest />
          <ModelSmokeTest />
          <ErrorBoundarySmokeTest />
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
          apiBaseUrl={apiBaseUrl}
          capabilities={capabilities}
          getToken={getToken}
          isOpen={isResourceAdapterOpen}
          lesson={lesson}
          onClose={() => setIsResourceAdapterOpen(false)}
          onError={(error) => log.error(error)}
        />
      </main>
    </>
  );
}
