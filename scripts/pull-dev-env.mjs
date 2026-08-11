import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Writes the root `.env` from the API project's Vercel `development`
 * environment, which Terraform owns. Not from Terraform Cloud directly: a
 * sensitive workspace variable is write-only and reads back as null.
 *
 * One root `.env` feeds both apps, so the API project carries the harness's
 * values too.
 */

const envFile = fileURLToPath(new URL("../.env", import.meta.url));

// Passed explicitly because a developer's default scope is their own account.
const scope = process.env.VERCEL_SCOPE ?? "oak-national-academy";

const result = spawnSync(
  "vercel",
  [
    "env",
    "pull",
    envFile,
    "--environment",
    "development",
    "--project",
    "oak-resource-adapter-api",
    "--scope",
    scope,
    "--yes",
  ],
  { stdio: "inherit" },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  console.error(
    "\nCould not pull the development environment. Run 'pnpm exec vercel login' if " +
      "you are not signed in, or set VERCEL_SCOPE if the project lives elsewhere.",
  );
  process.exit(result.status ?? 1);
}

console.log(`\nWrote ${envFile}.`);
