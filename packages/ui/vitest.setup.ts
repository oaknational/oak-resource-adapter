import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no layout engine and so ships no IntersectionObserver, but Oak
// components observe scroll position on mount and throw without it. Assigned
// directly rather than through `vi.stubGlobal` so that a test file calling
// `vi.unstubAllGlobals` cannot strip it midway.
globalThis.IntersectionObserver = class {
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as unknown as typeof IntersectionObserver;

// Testing Library only auto-cleans when a global `afterEach` is detected at
// import time, which does not happen reliably under Vitest's ESM loader, so
// unmount explicitly to stop one test's DOM leaking into the next.
afterEach(() => {
  cleanup();
});
