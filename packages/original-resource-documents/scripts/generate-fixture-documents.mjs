import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

import { parseResourceMarkup } from "@oaknational/resource-document/markup";

const fixturesDirectory = new URL("../fixtures/", import.meta.url);
const entries = await readdir(fixturesDirectory, { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isDirectory()) {
    continue;
  }

  const fixtureDirectory = new URL(`${entry.name}/`, fixturesDirectory);
  const markup = await readFile(new URL("extracted.mmd", fixtureDirectory), "utf8");
  const expectedDirectory = new URL("expected/", fixtureDirectory);
  await mkdir(expectedDirectory, { recursive: true });
  await writeFile(
    new URL("document.json", expectedDirectory),
    `${JSON.stringify(parseResourceMarkup(markup), null, 2)}\n`,
  );
}
