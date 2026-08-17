"use client";

import { ResourceAdapterErrorBoundary } from "@oaknational/resource-adapter";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useState } from "react";

import { SmokeTestPanel } from "./SmokeTestPanel";

const log = raLogger("harness");

function CrashOnRender(): never {
  throw new Error("Simulated Resource Adapter render failure");
}

export function ErrorBoundarySmokeTest() {
  const [isCrashing, setIsCrashing] = useState(false);

  return (
    <SmokeTestPanel
      buttonLabel={isCrashing ? "Clear simulated crash" : "Simulate adapter crash"}
      heading="Error boundary test"
      onRun={() => setIsCrashing((current) => !current)}
    >
      <p>
        Simulating a crash renders the package&apos;s fallback below and hands the error
        to the host&apos;s own logger. Try again re-catches while the simulated crash is
        active.
      </p>
      <ResourceAdapterErrorBoundary
        key={String(isCrashing)}
        onError={(error) => log.error(error)}
      >
        {isCrashing ? <CrashOnRender /> : <p>The adapter surface renders normally.</p>}
      </ResourceAdapterErrorBoundary>
    </SmokeTestPanel>
  );
}
