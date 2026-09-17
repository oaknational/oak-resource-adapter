"use client";

import { raLogger } from "@oaknational/resource-adapter-logger";
import { useCallback, useState } from "react";

import { roundTripStorage, StorageRoundTripFailed } from "../../harness-api";
import { SmokeTestPanel } from "./SmokeTestPanel";
import styles from "../../page.module.css";

const log = raLogger("harness");

type Outcome = {
  bucket: string | null;
  cleanupMessage: string | null;
  credentials: string | null;
  storageKey: string | null;
  summary: string;
};

function describeCredentials(federated: boolean | null): string | null {
  if (federated === null) {
    return null;
  }

  return federated
    ? "An impersonated service account"
    : "Application default credentials";
}

function StorageFacts({
  bucket,
  credentials,
  storageKey,
}: Readonly<Pick<Outcome, "bucket" | "credentials" | "storageKey">>) {
  const facts: readonly (readonly [string, string | null])[] = [
    ["Credentials", credentials],
    ["Key", storageKey],
    ["Bucket", bucket],
  ];

  return (
    <dl className={styles.smokeTestFacts}>
      {facts.map(([term, value]) =>
        value === null ? null : (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

export function StorageSmokeTest() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  const run = useCallback(async () => {
    setIsRunning(true);
    setOutcome(null);
    setHasFailed(false);

    try {
      const result = await roundTripStorage();

      setOutcome({
        bucket: result.bucket,
        cleanupMessage: null,
        credentials: describeCredentials(result.federated),
        storageKey: result.key,
        summary: `Wrote, read back and deleted a ${result.byteSize}-byte object.`,
      });
    } catch (thrown) {
      log.error(thrown);
      setHasFailed(true);

      const failure = thrown instanceof StorageRoundTripFailed ? thrown.failure : null;

      setOutcome({
        bucket: failure?.bucket ?? null,
        cleanupMessage: failure?.cleanupMessage ?? null,
        credentials: describeCredentials(failure?.federated ?? null),
        storageKey: failure?.key ?? null,
        summary:
          thrown instanceof Error
            ? thrown.message
            : "Could not reach artifact storage.",
      });
    } finally {
      setIsRunning(false);
    }
  }, []);

  let status = "Not run";
  if (isRunning) {
    status = "Running";
  } else if (hasFailed) {
    status = "Failed";
  } else if (outcome) {
    status = "Succeeded";
  }

  return (
    <SmokeTestPanel
      buttonLabel="Run storage round trip"
      disabled={isRunning}
      heading="Artifact storage test"
      onRun={() => void run()}
      status={status}
    >
      {outcome && (
        <>
          <p className={styles.smokeTestDetail}>{outcome.summary}</p>
          {outcome.cleanupMessage && (
            <p className={styles.smokeTestDetail}>
              Cleanup failed; the object may remain: {outcome.cleanupMessage}
            </p>
          )}
          <StorageFacts
            bucket={outcome.bucket}
            credentials={outcome.credentials}
            storageKey={outcome.storageKey}
          />
        </>
      )}
    </SmokeTestPanel>
  );
}
