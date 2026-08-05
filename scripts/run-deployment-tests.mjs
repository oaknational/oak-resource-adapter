import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.E2E_BASE_URL) {
  console.error(
    "E2E_BASE_URL is required. Set it to the deployed harness URL to avoid starting local services.",
  );
  process.exit(1);
}

const playwrightCli = fileURLToPath(
  new URL("../node_modules/@playwright/test/cli.js", import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [playwrightCli, "test", "--grep", "@deployment-safe"],
  {
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
