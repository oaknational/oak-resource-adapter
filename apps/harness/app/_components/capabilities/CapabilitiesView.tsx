"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  fetchTransformationCatalogue,
  type CapabilityCatalogueItem,
  type TransformationCatalogue,
  type TransformationCatalogueItem,
} from "../transformations/transformation-api";
import { readableIdentifier } from "../shared/readable-identifier";
import styles from "../../page.module.css";

function targetLabel(target: TransformationCatalogueItem["target"]): string {
  if (target.scope === "document") {
    return "Whole worksheet";
  }
  return target.nodeTypes
    .map((type) => readableIdentifier(type).toLowerCase())
    .join(" or ");
}

function TransformationRow({
  lessonId,
  transformation,
}: Readonly<{
  lessonId: string;
  transformation: TransformationCatalogueItem;
}>) {
  return (
    <li>
      <div className={styles.capabilityTransformationHeading}>
        <h4>{transformation.label}</h4>
        <span
          className={`${styles.statusBadge} ${
            transformation.status === "active"
              ? styles.activeStatus
              : styles.draftStatus
          }`}
        >
          {readableIdentifier(transformation.status)}
        </span>
      </div>
      <p>{transformation.suggestion.description}</p>
      <dl className={styles.capabilityTransformationFacts}>
        <div>
          <dt>Applies to</dt>
          <dd>{targetLabel(transformation.target)}</dd>
        </div>
        <div>
          <dt>Support choices</dt>
          <dd>
            {transformation.supportLevels === undefined
              ? "No level selection"
              : transformation.supportLevels
                  .map(({ level }) => readableIdentifier(level))
                  .join(", ")}
          </dd>
        </div>
      </dl>
      {transformation.barriers !== undefined && (
        <ul aria-label="Barriers addressed" className={styles.tagList}>
          {transformation.barriers.map((barrier) => (
            <li key={barrier}>{readableIdentifier(barrier)}</li>
          ))}
        </ul>
      )}
      <Link
        className={styles.textLink}
        href={`/?view=transformations&lesson=${encodeURIComponent(
          lessonId,
        )}&selection=${encodeURIComponent(transformation.kind)}`}
      >
        Inspect in Transformations
      </Link>
    </li>
  );
}

function TransformationGroup({
  lessonId,
  title,
  transformations,
}: Readonly<{
  lessonId: string;
  title: string;
  transformations: readonly TransformationCatalogueItem[];
}>) {
  if (transformations.length === 0) {
    return null;
  }

  return (
    <section className={styles.capabilityTransformationGroup}>
      <h3>{title}</h3>
      <ol className={styles.capabilityTransformationList}>
        {transformations.map((transformation) => (
          <TransformationRow
            key={transformation.kind}
            lessonId={lessonId}
            transformation={transformation}
          />
        ))}
      </ol>
    </section>
  );
}

function Capability({
  capability,
  catalogue,
  lessonId,
}: Readonly<{
  capability: CapabilityCatalogueItem;
  catalogue: TransformationCatalogue;
  lessonId: string;
}>) {
  const transformations = capability.transformationKinds.flatMap((kind) => {
    const transformation = catalogue.transformations.find(
      (candidate) => candidate.kind === kind,
    );
    return transformation === undefined ? [] : [transformation];
  });
  const active = transformations.filter(({ status }) => status === "active");
  const drafts = transformations.filter(({ status }) => status === "draft");

  return (
    <li>
      <section
        aria-labelledby={`capability-${capability.id}`}
        className={styles.capabilitySection}
      >
        <div className={styles.capabilityHeader}>
          <div>
            <p className={styles.profileKicker}>Product capability</p>
            <h2 id={`capability-${capability.id}`}>{capability.label}</h2>
          </div>
          <span className={styles.resourceBadge}>
            {readableIdentifier(capability.resourceType)}
          </span>
        </div>

        <dl className={styles.capabilityFacts}>
          <div>
            <dt>Active transformations</dt>
            <dd>{active.length}</dd>
          </div>
          <div>
            <dt>Configured drafts</dt>
            <dd>{drafts.length}</dd>
          </div>
          <div>
            <dt>Suggestion flow</dt>
            <dd>{capability.suggestionFlowId ?? "None"}</dd>
          </div>
        </dl>

        {capability.suggestionFlowId !== undefined && (
          <div className={styles.capabilityActions}>
            <Link
              href={`/?view=suggestions&lesson=${encodeURIComponent(
                lessonId,
              )}&selection=${encodeURIComponent(capability.suggestionFlowId)}`}
            >
              Open suggestion agent
            </Link>
          </div>
        )}

        <TransformationGroup
          lessonId={lessonId}
          title="Available transformations"
          transformations={active}
        />
        <TransformationGroup
          lessonId={lessonId}
          title="Configured drafts"
          transformations={drafts}
        />
      </section>
    </li>
  );
}

export function CapabilitiesView({ lessonId }: Readonly<{ lessonId: string }>) {
  const [catalogue, setCatalogue] = useState<TransformationCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTransformationCatalogue()
      .then((value) => {
        if (!cancelled) {
          setCatalogue(value);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The capability catalogue could not load.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <article className={styles.capabilities}>
      <p className={styles.eyebrow}>Registry browser</p>
      <h1>Capabilities</h1>
      <p>
        Browse the product experiences registered with Resource Adapter and the
        transformations each one can offer.
      </p>

      {error !== null && (
        <p className={styles.errorMessage} role="alert">
          {error}
        </p>
      )}
      {catalogue === null && error === null && (
        <p aria-live="polite" role="status">
          Loading capability catalogue…
        </p>
      )}
      {catalogue !== null && (
        <ol className={styles.capabilityList}>
          {catalogue.capabilities.map((capability) => (
            <Capability
              capability={capability}
              catalogue={catalogue}
              key={capability.id}
              lessonId={lessonId}
            />
          ))}
        </ol>
      )}
    </article>
  );
}
