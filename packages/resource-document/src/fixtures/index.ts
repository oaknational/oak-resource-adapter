import { readFile } from "node:fs/promises";

import { parseResourceDocument } from "../parse.js";
import type { ResourceDocument } from "../schema/current.js";

export interface ResourceDocumentFixtureManifestEntry {
  id: string;
  title: string;
  description: string;
  markupVersion: string;
  schemaVersion: string;
  profile: string;
  /** Where the content came from, since fixtures ship with the package. */
  rights: string;
}

export interface LoadedResourceDocumentFixture {
  manifest: ResourceDocumentFixtureManifestEntry;
  markup: string;
  expectedDocument: ResourceDocument;
}

export const resourceDocumentFixtureManifest = [
  {
    id: "linear-equations-smoke",
    title: "Exploring linear equations",
    description:
      "Synthetic worksheet fixture derived from the initial design screenshots.",
    markupVersion: "0.1",
    schemaVersion: "0.1",
    profile: "worksheet.v0",
    rights: "Synthetic test content committed under the repository licence.",
  },
] as const satisfies readonly ResourceDocumentFixtureManifestEntry[];

const fixturesDirectory = new URL("../../fixtures/", import.meta.url);

export async function loadResourceDocumentFixture(
  id: string,
): Promise<LoadedResourceDocumentFixture> {
  const manifest = resourceDocumentFixtureManifest.find((entry) => entry.id === id);
  if (!manifest) {
    throw new Error(`Unknown resource document fixture ${JSON.stringify(id)}.`);
  }

  const fixtureDirectory = new URL(`${id}/`, fixturesDirectory);
  const [markup, expectedJson] = await Promise.all([
    readFile(new URL("extracted.mmd", fixtureDirectory), "utf8"),
    readFile(new URL("expected/document.json", fixtureDirectory), "utf8"),
  ]);

  return {
    manifest,
    markup,
    expectedDocument: parseResourceDocument(JSON.parse(expectedJson) as unknown),
  };
}
