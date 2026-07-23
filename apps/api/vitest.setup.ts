import { resetErrorReporter } from "@oaknational/resource-adapter-logger";
import { afterEach } from "vitest";

// The logger's error reporter is a process-global singleton (it lives on
// globalThis to survive Next's bundle-splitting), so it is NOT cleared by
// vi.resetModules and would otherwise leak between tests. Clear it after every
// test so a reporter registered by one test can't affect the next.
afterEach(() => {
  resetErrorReporter();
});
