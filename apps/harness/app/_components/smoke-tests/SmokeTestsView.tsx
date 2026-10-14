import { ErrorBoundarySmokeTest } from "./ErrorBoundarySmokeTest";
import { ModelSmokeTest } from "./ModelSmokeTest";
import { ModerationSmokeTest } from "./ModerationSmokeTest";
import { StorageSmokeTest } from "./StorageSmokeTest";
import { WorkerSmokeTest } from "./WorkerSmokeTest";
import styles from "../../page.module.css";

export function SmokeTestsView() {
  return (
    <article className={styles.smokeTests}>
      <p className={styles.eyebrow}>Harness diagnostics</p>
      <h1>Smoke tests</h1>
      <WorkerSmokeTest />
      <ModelSmokeTest />
      <ModerationSmokeTest />
      <StorageSmokeTest />
      <ErrorBoundarySmokeTest />
    </article>
  );
}
