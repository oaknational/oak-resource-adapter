"use client";

import { raLogger } from "@oaknational/resource-adapter-logger";
import { useCallback, useEffect, useState } from "react";

import { createTestJob, readTestJob, type TestJobResponse } from "./harness-api";
import { SmokeTestPanel } from "./SmokeTestPanel";

const log = raLogger("harness");

const statusLabels = {
  failed: "Failed",
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
} as const satisfies Record<TestJobResponse["status"], string>;

const pollIntervalMs = 500;

export function WorkerSmokeTest() {
  const [job, setJob] = useState<TestJobResponse | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobId = job?.id;
  const jobIsActive = job?.status === "queued" || job?.status === "running";

  const run = useCallback(async () => {
    setIsCreating(true);
    setJob(null);
    setError(null);

    try {
      setJob(await createTestJob());
    } catch (thrown) {
      log.error(thrown);
      setError("Could not create the test job.");
    } finally {
      setIsCreating(false);
    }
  }, []);

  // Keyed on the job's id rather than the job, so a poll that returns the same
  // status does not tear down and restart the interval.
  useEffect(() => {
    if (jobId === undefined || !jobIsActive) {
      return;
    }

    const activeJobId = jobId;
    const controller = new AbortController();
    let requestInFlight = false;

    async function poll() {
      if (requestInFlight) {
        return;
      }

      requestInFlight = true;

      try {
        setJob(await readTestJob(activeJobId, controller.signal));
      } catch (thrown) {
        if (thrown instanceof DOMException && thrown.name === "AbortError") {
          return;
        }

        log.error(thrown);
        setJob(null);
        setError("Could not read the test job status.");
      } finally {
        requestInFlight = false;
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), pollIntervalMs);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [jobId, jobIsActive]);

  let status = "Not run";
  if (isCreating) {
    status = "Creating";
  } else if (error) {
    status = error;
  } else if (job) {
    status = statusLabels[job.status];
    if (job.failure?.message) {
      status += `: ${job.failure.message}`;
    }
  }

  return (
    <SmokeTestPanel
      buttonLabel="Run test job"
      disabled={isCreating || jobIsActive}
      heading="Background worker test"
      onRun={() => void run()}
      status={status}
    />
  );
}
