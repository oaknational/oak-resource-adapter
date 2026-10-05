import { readFileSync } from "node:fs";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

/**
 * The unbundled build cannot import package.json: esbuild drops the JSON import
 * attribute, and Node then refuses to load the module.
 */
export const packageVersionDefine = {
  __RESOURCE_ADAPTER_VERSION__: JSON.stringify(version),
};
