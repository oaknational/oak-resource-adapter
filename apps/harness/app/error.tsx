"use client";

import { OakSecondaryButton } from "@oaknational/oak-components";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useEffect } from "react";

import shared from "./_components/shared/shared.module.css";

const log = raLogger("harness");

export default function HarnessError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    log.error(error);
  }, [error]);

  return (
    <main className={shared.main} id="main-content">
      <article className={shared.lesson}>
        <p className={shared.eyebrow}>Harness error</p>
        <h1>This scenario could not be loaded</h1>
        <p>
          Loading a scenario reads an extraction and parses it. The failure below
          reached the page instead of being handled by the scenario that caused it.
        </p>
        <dl className={shared.metadataGrid}>
          <div>
            <dt>Message</dt>
            <dd>{error.message}</dd>
          </div>
          <div>
            <dt>Digest</dt>
            <dd>{error.digest ?? "not set"}</dd>
          </div>
        </dl>
        <OakSecondaryButton onClick={reset}>Try again</OakSecondaryButton>
      </article>
    </main>
  );
}
