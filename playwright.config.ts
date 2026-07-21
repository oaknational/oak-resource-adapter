import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pnpm --filter @oaknational/resource-adapter-api dev",
      port: 3001,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter @oaknational/resource-adapter-harness dev",
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
