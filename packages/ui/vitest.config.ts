import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Component tests render into a real DOM, and Testing Library's cleanup and
    // jest-dom matchers are registered once for every file in the setup.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
