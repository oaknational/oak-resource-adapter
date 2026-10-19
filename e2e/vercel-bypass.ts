import { fileURLToPath } from "node:url";

// Outside test-results/, which CI uploads when a run fails.
export const vercelBypassStatePath = fileURLToPath(
  new URL("../playwright/.auth/vercel-bypass.json", import.meta.url),
);
