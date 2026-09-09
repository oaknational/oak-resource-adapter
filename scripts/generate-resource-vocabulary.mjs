import { readFile, writeFile } from "node:fs/promises";
import { vocabularyHandoffTable } from "../packages/resource-document/dist/vocabulary-handoff.js";
const path = new URL(
  "../packages/resource-document/EXTRACTION_HANDOFF.md",
  import.meta.url,
);
const document = await readFile(path, "utf8");
const vocabularyBlock = /<!-- vocabulary:start -->[\s\S]*?<!-- vocabulary:end -->/;
if (!vocabularyBlock.test(document)) {
  throw new Error("Extraction handoff is missing its vocabulary marker pair.");
}
await writeFile(
  path,
  document.replace(
    vocabularyBlock,
    `<!-- vocabulary:start -->\n${vocabularyHandoffTable()}\n<!-- vocabulary:end -->`,
  ),
);
