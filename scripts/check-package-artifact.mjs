import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectory = await mkdtemp(join(tmpdir(), "resource-adapter-package-"));

function run(command, arguments_, cwd) {
  execFileSync(command, arguments_, {
    cwd,
    stdio: "inherit",
  });
}

async function findTarball(matches) {
  const files = await readdir(temporaryDirectory);
  const tarball = files.find(matches);

  if (!tarball) {
    throw new Error("Could not find package artifact.");
  }

  return join(temporaryDirectory, tarball);
}

// Pin peers to the workspace-resolved versions so the check cannot break
// when a peer publishes a new version outside our lockfile.
async function installedVersion(packageName, workspacePackage = "ui") {
  const manifest = await readFile(
    join(
      repositoryRoot,
      `packages/${workspacePackage}/node_modules`,
      packageName,
      "package.json",
    ),
    "utf8",
  );
  return JSON.parse(manifest).version;
}

function readPackedManifest(tarball) {
  return JSON.parse(readPackedFile(tarball, "package/package.json"));
}

function readPackedFile(tarball, file) {
  return execFileSync("tar", ["-xOf", tarball, file], {
    encoding: "utf8",
  });
}

function listPackedFiles(tarball) {
  return execFileSync("tar", ["-tf", tarball], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0);
}

try {
  await Promise.all([
    rm(join(repositoryRoot, "packages/contracts/dist"), {
      force: true,
      recursive: true,
    }),
    rm(join(repositoryRoot, "packages/ui/dist"), {
      force: true,
      recursive: true,
    }),
    rm(join(repositoryRoot, "packages/resource-document/dist"), {
      force: true,
      recursive: true,
    }),
  ]);
  run("pnpm", ["build"], repositoryRoot);

  run(
    "pnpm",
    [
      "--filter",
      "@oaknational/resource-adapter-contracts",
      "pack",
      "--pack-destination",
      temporaryDirectory,
    ],
    repositoryRoot,
  );

  run(
    "pnpm",
    [
      "--filter",
      "@oaknational/resource-document",
      "pack",
      "--pack-destination",
      temporaryDirectory,
    ],
    repositoryRoot,
  );

  run(
    "pnpm",
    [
      "--filter",
      "@oaknational/resource-adapter",
      "pack",
      "--pack-destination",
      temporaryDirectory,
    ],
    repositoryRoot,
  );

  const uiTarball = await findTarball(
    (file) => /^oaknational-resource-adapter-\d/.test(file) && file.endsWith(".tgz"),
  );
  const contractsTarball = await findTarball(
    (file) =>
      /^oaknational-resource-adapter-contracts-\d/.test(file) && file.endsWith(".tgz"),
  );
  const resourceDocumentTarball = await findTarball(
    (file) => /^oaknational-resource-document-\d/.test(file) && file.endsWith(".tgz"),
  );
  const contractsManifest = readPackedManifest(contractsTarball);
  const resourceDocumentManifest = readPackedManifest(resourceDocumentTarball);
  const uiManifest = readPackedManifest(uiTarball);

  if (contractsManifest.version !== uiManifest.version) {
    throw new Error("Published UI and contracts packages must use the same version.");
  }

  if (
    uiManifest.dependencies?.["@oaknational/resource-adapter-contracts"] !==
    contractsManifest.version
  ) {
    throw new Error(
      "Published UI package must depend on the matching exact contracts version.",
    );
  }

  await writeFile(
    join(temporaryDirectory, "package.json"),
    JSON.stringify(
      {
        name: "resource-adapter-artifact-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@oaknational/oak-components": await installedVersion(
            "@oaknational/oak-components",
          ),
          "@oaknational/resource-adapter-contracts": `file:${contractsTarball}`,
          "@oaknational/resource-adapter": `file:${uiTarball}`,
          "@oaknational/resource-document": `file:${resourceDocumentTarball}`,
          next: await installedVersion("next"),
          "next-cloudinary": await installedVersion("next-cloudinary"),
          react: await installedVersion("react"),
          "react-dom": await installedVersion("react-dom"),
          "styled-components": await installedVersion("styled-components"),
          zod: await installedVersion("zod", "contracts"),
        },
        pnpm: {
          overrides: {
            "@oaknational/resource-adapter-contracts": `file:${contractsTarball}`,
          },
        },
      },
      null,
      2,
    ),
  );

  run("pnpm", ["install", "--config.auto-install-peers=false"], temporaryDirectory);

  if (
    resourceDocumentManifest.private !== true ||
    resourceDocumentManifest.version !== "0.0.0"
  ) {
    throw new Error(
      "The ORA-local resource-document artifact must remain private at version 0.0.0.",
    );
  }

  if (resourceDocumentManifest.peerDependencies?.zod !== "^4.4.3") {
    throw new Error("Resource-document must expose its Zod 4 peer dependency.");
  }

  // resource-document is private at 0.0.0, so a consumer cannot resolve it from
  // the registry. Published code may use it internally, but the moment it
  // reaches a published manifest or declaration the consuming install breaks —
  // in OWA rather than here. Both halves matter: pack rewrites workspace:* to
  // the resolved version, and tsc emits the module specifier for any exported
  // type that names it.
  for (const [unit, tarball] of [
    ["contracts", contractsTarball],
    ["ui", uiTarball],
  ]) {
    const manifest = readPackedManifest(tarball);
    const declaringField = [
      "dependencies",
      "peerDependencies",
      "optionalDependencies",
    ].find(
      (field) => manifest[field]?.["@oaknational/resource-document"] !== undefined,
    );

    if (declaringField) {
      throw new Error(
        `Published ${unit} package declares the private @oaknational/resource-document in ${declaringField}. Keep it a devDependency, or publish it.`,
      );
    }

    const leakingDeclarations = listPackedFiles(tarball)
      .filter((file) => file.endsWith(".d.ts"))
      .filter((file) =>
        readPackedFile(tarball, file).includes("@oaknational/resource-document"),
      );

    if (leakingDeclarations.length > 0) {
      throw new Error(
        `Published ${unit} declarations name the private @oaknational/resource-document: ${leakingDeclarations.join(", ")}. Keep document types out of the published signature, or publish that package.`,
      );
    }
  }

  for (const declaration of [
    "package/dist/index.d.ts",
    "package/dist/markup/index.d.ts",
  ]) {
    readPackedFile(resourceDocumentTarball, declaration);
  }
  readPackedFile(resourceDocumentTarball, "package/EXTRACTION_HANDOFF.md");
  const unexpectedFixtureFiles = listPackedFiles(resourceDocumentTarball).filter(
    (file) => file.includes("/fixtures/"),
  );
  if (unexpectedFixtureFiles.length > 0) {
    throw new Error(
      `Portable resource-document artifact contains private ORA fixtures: ${unexpectedFixtureFiles.join(", ")}`,
    );
  }

  await writeFile(
    join(temporaryDirectory, "resource-document-smoke.mjs"),
    `import assert from "node:assert/strict";
import {
  CURRENT_SCHEMA_VERSION,
  parseResourceDocument,
} from "@oaknational/resource-document";
import {
  CURRENT_MARKUP_VERSION,
  parseResourceMarkup,
} from "@oaknational/resource-document/markup";

assert.equal(CURRENT_SCHEMA_VERSION, "0.1");
assert.equal(CURRENT_MARKUP_VERSION, "0.1");
const document = parseResourceMarkup(\`---
markup-version: "0.1"
schema-version: "0.1"
profile: "generic.v0"
document-id: "artifact-smoke"
language: "en-GB"
source-system: "test"
source-id: "artifact-smoke"
producer: "artifact-test"
producer-version: "1"
---

:::oak-paragraph {id="paragraph"}
Portable artifact smoke test.
:::
\`);
assert.deepEqual(parseResourceDocument(document), document);
`,
  );
  run("node", ["resource-document-smoke.mjs"], temporaryDirectory);

  const rootDeclaration = readPackedFile(uiTarball, "package/dist/index.d.ts");
  for (const exportName of [
    "getResourceAdapterCapabilities",
    "ResourceAdapterButton",
    "ResourceAdapterDialog",
    "ResourceAdapterErrorBoundary",
  ]) {
    if (!rootDeclaration.includes(exportName)) {
      throw new Error(`Published package is missing ${exportName}.`);
    }
  }

  // "use client" must sit exactly on the component modules: app-router hosts
  // need it there, and every other module must stay callable from server code.
  //
  // Listed by hand on purpose. Deriving them from `src` would make this agree
  // with whatever the source says, so a directive added to a server-safe module
  // by mistake would pass. Adding a module means choosing a list for it.
  const clientModules = [
    "FeatureFlag.js",
    "ResourceAdapterButton.js",
    "ResourceAdapterDialog.js",
    "ResourceAdapterErrorBoundary.js",
  ];
  const serverSafeModules = [
    "index.js",
    "client.js",
    "errors.js",
    "getResourceAdapterCapabilities.js",
    "getResourceAdapterFeatureFlags.js",
    "capabilities.js",
    "publicTypes.js",
  ];

  for (const file of clientModules) {
    if (
      !readPackedFile(uiTarball, `package/dist/${file}`).startsWith('"use client";')
    ) {
      throw new Error(`dist/${file} is missing the "use client" directive.`);
    }
  }

  for (const file of serverSafeModules) {
    if (readPackedFile(uiTarball, `package/dist/${file}`).startsWith('"use client";')) {
      throw new Error(`dist/${file} must not carry the "use client" directive.`);
    }
  }

  // Nothing beyond those lists may ship. This catches both a module nobody
  // listed above and a build artefact importing packages hosts do not install
  const packedModules = execFileSync("tar", ["-tf", uiTarball], { encoding: "utf8" })
    .split("\n")
    .filter((path) => /^package\/dist\/[^/]+\.js$/.test(path))
    .map((path) => basename(path));
  const expectedModules = new Set([...clientModules, ...serverSafeModules]);
  const unexpectedModules = packedModules.filter(
    (module) => !expectedModules.has(module),
  );

  if (unexpectedModules.length > 0) {
    throw new Error(
      `Published package ships modules with no source counterpart: ${unexpectedModules.join(", ")}.`,
    );
  }

  const capabilitiesEntryPoint = join(
    temporaryDirectory,
    "node_modules/@oaknational/resource-adapter/dist/getResourceAdapterCapabilities.js",
  );
  const capabilitiesExports = await import(pathToFileURL(capabilitiesEntryPoint).href);

  if (typeof capabilitiesExports.getResourceAdapterCapabilities !== "function") {
    throw new Error(
      "Published package is missing a callable getResourceAdapterCapabilities.",
    );
  }

  console.log(`Verified package artifact: ${basename(uiTarball)}`);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
