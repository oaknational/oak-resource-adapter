import { ErrorBoundarySmokeTest } from "./ErrorBoundarySmokeTest";
import { ModelSmokeTest } from "./ModelSmokeTest";
import { WorkerSmokeTest } from "./WorkerSmokeTest";
import styles from "../page.module.css";

export function SmokeTestsView() {
  return (
    <article className={styles.smokeTests}>
      <p className={styles.eyebrow}>Harness diagnostics</p>
      <h1>Smoke tests</h1>
      <p>
        Run focused checks for the API worker, model invocation and Resource Adapter
        error boundary.
      </p>
      <WorkerSmokeTest />
      <ModelSmokeTest />
      <ErrorBoundarySmokeTest />
    </article>
  );
}
