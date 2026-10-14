"use client";

import { raLogger } from "@oaknational/resource-adapter-logger";
import { useCallback, useState } from "react";

import {
  moderateContent,
  type ModerationSmokeCase,
  type ModerationSmokeResponse,
} from "../../harness-api";
import { SmokeTestPanel } from "./SmokeTestPanel";

const log = raLogger("harness");

const smokeCases = [
  { smokeCase: "expected-pass", label: "Expected pass", expected: "PASSED" },
  { smokeCase: "expected-flag", label: "Expected flag", expected: "FLAGGED" },
] as const satisfies readonly {
  smokeCase: ModerationSmokeCase;
  label: string;
  expected: ModerationSmokeResponse["outcome"];
}[];

type CaseResult = Readonly<{
  label: string;
  expected: ModerationSmokeResponse["outcome"];
  response: ModerationSmokeResponse;
}>;

function describeResponse({
  outcome,
  flaggedCategories,
  reason,
}: ModerationSmokeResponse) {
  if (outcome === "FAILED") {
    return `FAILED (${reason ?? "no reason given"})`;
  }
  return flaggedCategories.length === 0
    ? outcome
    : `${outcome}: ${flaggedCategories.join(", ")}`;
}

export function ModerationSmokeTest() {
  const [results, setResults] = useState<readonly CaseResult[] | null>(null);
  const [isModerating, setIsModerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const run = useCallback(async () => {
    setIsModerating(true);
    setResults(null);
    setErrorMessage(null);

    try {
      setResults(
        await Promise.all(
          smokeCases.map(async ({ smokeCase, label, expected }) => ({
            label,
            expected,
            response: await moderateContent(smokeCase),
          })),
        ),
      );
    } catch (error) {
      log.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not run the moderation smoke test.",
      );
    } finally {
      setIsModerating(false);
    }
  }, []);

  let status = "Not run";
  if (isModerating) {
    status = "Moderating";
  } else if (errorMessage) {
    status = errorMessage;
  } else if (results) {
    status = results.every(({ expected, response }) => response.outcome === expected)
      ? "Both cases behaved as expected"
      : "A case did not behave as expected";
  }

  return (
    <SmokeTestPanel
      buttonLabel="Run moderation"
      disabled={isModerating}
      heading="Moderation test"
      onRun={() => void run()}
      status={status}
    >
      {results && (
        <ul>
          {results.map(({ label, expected, response }) => (
            <li key={label}>
              {label}: {describeResponse(response)}
              {response.outcome === expected
                ? " (as expected)"
                : ` (expected ${expected})`}
            </li>
          ))}
        </ul>
      )}
    </SmokeTestPanel>
  );
}
