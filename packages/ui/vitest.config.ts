import { defineConfig } from "vitest/config";

import { packageVersionDefine } from "./packageVersion.js";

export default defineConfig({
  define: packageVersionDefine,
  test: {
    setupFiles: ["./vitest.setup.ts"],
  },
});
