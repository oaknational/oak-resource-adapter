import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: ["src/client.ts", "src/index.ts"],
  format: ["esm"],
  sourcemap: true,
});
