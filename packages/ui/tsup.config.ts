import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  noExternal: ["@oaknational/resource-adapter-contracts", "zod"],
  sourcemap: true,
});
