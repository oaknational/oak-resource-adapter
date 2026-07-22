"use client";

import {
  getResourceAdapterCapabilities,
  ResourceAdapterButton,
  ResourceAdapterDialog,
  type LessonContext,
  type ResourceAdapterCapability,
} from "@oaknational/resource-adapter";
import { OakSecondaryButton } from "@oaknational/oak-components";
import { useCallback, useEffect, useState } from "react";

import styles from "./page.module.css";

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

const getToken = async (): Promise<string | null> => null;

type ApiHealthState = "checking" | "healthy" | "unavailable";

const apiHealthLabels: Record<ApiHealthState, string> = {
  checking: "Checking",
  healthy: "Healthy",
  unavailable: "Unavailable",
};

export default function HarnessPage() {
  const [capabilities, setCapabilities] = useState<
    readonly ResourceAdapterCapability[]
  >([]);
  const [capabilitiesState, setCapabilitiesState] = useState<
    "error" | "loading" | "ready"
  >("loading");
  const [apiHealthState, setApiHealthState] = useState<ApiHealthState>("checking");
  const [isResourceAdapterOpen, setIsResourceAdapterOpen] = useState(false);

  const loadCapabilities = useCallback(async () => {
    setCapabilitiesState("loading");

    try {
      const response = await getResourceAdapterCapabilities({
        getToken,
        lesson,
        trpcEndpoint,
      });

      setCapabilities(response.capabilities);
      setCapabilitiesState("ready");
    } catch (error) {
      console.error("Unable to load Resource Adapter capabilities", error);
      setCapabilities([]);
      setCapabilitiesState("error");
    }
  }, []);

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
