import { defineConfig } from "tsup";

// No bundling: one output module per source module, so the "use client"
// directives written in the component sources survive per file. Bundling
// would strip them (esbuild cannot claim one module's directive for a whole
// bundle), and a banner would wrongly mark server-safe modules as client.
export default defineConfig({
  bundle: false,
  clean: true,
  // Declaration files carry no runtime code, and compiling them emits a module
  // importing test-only packages that hosts do not install.
  entry: ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.*", "!src/**/*.d.ts"],
  format: ["esm"],
  sourcemap: true,
});
