import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  const { installMockIntersectionObserver, installMockResizeObserver } =
    await import("@oaknational/oak-components");

  installMockIntersectionObserver();
  installMockResizeObserver();

  afterEach(() => {
    cleanup();
  });
}
