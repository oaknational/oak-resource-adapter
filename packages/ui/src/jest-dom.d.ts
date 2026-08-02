/*
 * Type-only registration of jest-dom's matchers on vitest's `expect`, so the
 * component tests type-check. The runtime registration happens in
 * ../vitest.setup.ts. Excluded from the publish build alongside the tests.
 */
import "@testing-library/jest-dom/vitest";
