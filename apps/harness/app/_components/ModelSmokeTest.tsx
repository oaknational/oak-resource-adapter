"use client";

import { raLogger } from "@oaknational/resource-adapter-logger";
import { useCallback, useState } from "react";

import { invokeModel, type ModelInvocationResponse } from "../harness-api";
import { SmokeTestPanel } from "./SmokeTestPanel";

const log = raLogger("harness");

const outcomeLabels = {
  INCOMPLETE: "Incomplete response",
  OUTPUT_MISSING: "No output returned",
  REFUSAL: "Refused by the model",
  SUCCESS: "Succeeded",
} as const satisfies Record<ModelInvocationResponse["outcome"], string>;

export function ModelSmokeTest() {
  const [result, setResult] = useState<ModelInvocationResponse | null>(null);
  const [isInvoking, setIsInvoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setIsInvoking(true);
    setResult(null);
    setError(null);

    try {
      setResult(await invokeModel());
    } catch (thrown) {
      log.error(thrown);
      setError(
        thrown instanceof Error
          ? thrown.message
          : "Could not run the model invocation.",
      );
    } finally {
      setIsInvoking(false);
    }
  }, []);

  let status = "Not run";
  if (isInvoking) {
    status = "Invoking";
  } else if (error) {
    status = error;
  } else if (result) {
    status = outcomeLabels[result.outcome];
    if (result.outcome === "SUCCESS" && result.usage) {
      status += ` (${result.usage.outputTokens} output tokens)`;
    }
  }

  return (
    <SmokeTestPanel
      buttonLabel="Run model invocation"
      disabled={isInvoking}
      heading="Model invocation test"
      onRun={() => void run()}
      status={status}
    >
      {result?.outputText && <p>Model output: {result.outputText}</p>}
    </SmokeTestPanel>
  );
}
