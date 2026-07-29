import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The schema tests exercise real constraints, so they need a database rather
    // than a mock and run sequentially against one.
    fileParallelism: false,
  },
});
