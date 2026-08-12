import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      RUN_CURRICULUM_INTEGRATION_TESTS:
        process.env.RUN_CURRICULUM_INTEGRATION_TESTS || "false",
    },
  },
});
