import { defineConfig } from "tsup";

export default defineConfig([
  {
    // esbuild strips "use client" from bundled modules; app-router hosts need it.
    banner: { js: '"use client";' },
    clean: true,
    entry: ["src/index.ts"],
    format: ["esm"],
    sourcemap: true,
  },
  {
    // No banner: the tRPC client stays importable from server code.
    clean: false,
    entry: ["src/client.ts"],
    format: ["esm"],
    sourcemap: true,
  },
]);
