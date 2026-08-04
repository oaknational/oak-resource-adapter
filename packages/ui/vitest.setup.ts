import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when a global `afterEach` is detected at
// import time, which does not happen reliably under Vitest's ESM loader, so
// unmount explicitly to stop one test's DOM leaking into the next.
afterEach(() => {
  cleanup();
});
