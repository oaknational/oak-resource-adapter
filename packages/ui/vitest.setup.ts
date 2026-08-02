import { afterEach } from "vitest";

/*
 * The default test environment stays node (wire-format tests need no DOM).
 * Component tests opt in with a `// @vitest-environment jsdom` docblock, and
 * only they need the DOM tooling below.
 */
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  const { installMockIntersectionObserver, installMockResizeObserver } =
    await import("@oaknational/oak-components");

  // oak-components observes visibility and size; jsdom implements neither.
  installMockIntersectionObserver();
  installMockResizeObserver();

  afterEach(() => {
    cleanup();
  });
}
