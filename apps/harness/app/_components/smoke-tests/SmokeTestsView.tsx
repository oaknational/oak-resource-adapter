import { ErrorBoundarySmokeTest } from "./ErrorBoundarySmokeTest";
import { ModelSmokeTest } from "./ModelSmokeTest";
import { StorageSmokeTest } from "./StorageSmokeTest";
import { WorkerSmokeTest } from "./WorkerSmokeTest";
import shared from "../shared/shared.module.css";

export function SmokeTestsView() {
  return (
    <article className={shared.smokeTests}>
      <p className={shared.eyebrow}>Harness diagnostics</p>
      <h1>Smoke tests</h1>
      <WorkerSmokeTest />
      <ModelSmokeTest />
      <StorageSmokeTest />
      <ErrorBoundarySmokeTest />
    </article>
  );
}
