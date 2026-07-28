import { defineConfig } from "tsup";

// No bundling: one output module per source module, so the "use client"
// directives written in the component sources survive per file. Bundling
// would strip them (esbuild cannot claim one module's directive for a whole
// bundle), and a banner would wrongly mark server-safe modules as client.
export default defineConfig({
  bundle: false,
  clean: true,
  entry: ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.*"],
  format: ["esm"],
  sourcemap: true,
});
