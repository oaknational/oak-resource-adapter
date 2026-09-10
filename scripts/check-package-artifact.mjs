import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectory = await mkdtemp(join(tmpdir(), "resource-adapter-package-"));
const zodFreeTemporaryDirectory = await mkdtemp(
  join(tmpdir(), "resource-document-zod-free-"),
);

// The consumers below sit outside the workspace, so pnpm would otherwise run
// them with whatever version is on PATH rather than the one CI uses.
const { packageManager } = JSON.parse(
  await readFile(join(repositoryRoot, "package.json"), "utf8"),
);

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

  if (
    contractsManifest.version !== uiManifest.version ||
    resourceDocumentManifest.version !== uiManifest.version
  ) {
    throw new Error(
      "Published UI, contracts and resource-document packages must use the same version.",
    );
  }

  if (
    uiManifest.dependencies?.["@oaknational/resource-adapter-contracts"] !==
    contractsManifest.version
  ) {
    throw new Error(
      "Published UI package must depend on the matching exact contracts version.",
    );
  }

  for (const [consumerName, manifest] of [
    ["UI", uiManifest],
    ["contracts", contractsManifest],
  ]) {
    if (
      manifest.dependencies?.["@oaknational/resource-document"] !==
      resourceDocumentManifest.version
    ) {
      throw new Error(
        `Published ${consumerName} package must depend on the matching exact resource-document version.`,
      );
    }
  }

  await writeFile(
    join(temporaryDirectory, "package.json"),
    JSON.stringify(
      {
        name: "resource-adapter-artifact-consumer",
        private: true,
        type: "module",
        packageManager,
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
      },
      null,
      2,
    ),
  );

  // The tarballs depend on workspace packages that are not published, so these
  // overrides have to apply. pnpm 11 ignores the manifest's `pnpm` field.
  await writeFile(
    join(temporaryDirectory, "pnpm-workspace.yaml"),
    `overrides:
  "@oaknational/resource-adapter-contracts": "file:${contractsTarball}"
  "@oaknational/resource-document": "file:${resourceDocumentTarball}"
`,
  );

  run("pnpm", ["install", "--config.auto-install-peers=false"], temporaryDirectory);

  // Peer, not a dependency: the parsing entries hand out or execute schemas,
  // and zod throws when a schema meets a foreign major. Optional because the
  // root runtime and type-only imports need no zod. Declaration reachability
  // and the isolated runtime smoke test below hold us to both halves.
  if (
    resourceDocumentManifest.peerDependencies?.zod !== "^4" ||
    resourceDocumentManifest.peerDependenciesMeta?.zod?.optional !== true
  ) {
    throw new Error(
      "Resource-document must expose its Zod peer dependency as optional.",
    );
  }

  for (const [entry, needsZod] of [
    ["index", false],
    ["markup/index", false],
    ["parse", false],
    ["schema/index", true],
  ]) {
    const reached = new Set();
    const pending = [`package/dist/${entry}.d.ts`];
    let reachesZod = false;

    while (pending.length > 0) {
      const file = pending.pop();
      if (reached.has(file)) {
        continue;
      }
      reached.add(file);
      const declaration = readPackedFile(resourceDocumentTarball, file);
      if (/from "zod/.test(declaration)) {
        reachesZod = true;
      }
      for (const [, specifier] of declaration.matchAll(/from "(\.[^"]*)\.js"/g)) {
        pending.push(join(dirname(file), `${specifier}.d.ts`).replaceAll("\\", "/"));
      }
    }

    if (reachesZod !== needsZod) {
      throw new Error(
        needsZod
          ? `Published resource-document ${entry} entry no longer exposes the Zod schemas.`
          : `Published resource-document ${entry} entry reaches zod, so a type-only consumer must install it.`,
      );
    }
  }

  for (const declaration of [
    "package/dist/index.d.ts",
    "package/dist/markup/index.d.ts",
    "package/dist/parse.d.ts",
    "package/dist/schema/index.d.ts",
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
} from "@oaknational/resource-document/parse";
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

  await writeFile(
    join(zodFreeTemporaryDirectory, "package.json"),
    JSON.stringify(
      {
        name: "resource-document-zod-free-consumer",
        private: true,
        type: "module",
        packageManager,
        dependencies: {
          "@oaknational/resource-document": `file:${resourceDocumentTarball}`,
        },
      },
      null,
      2,
    ),
  );
  run(
    "pnpm",
    ["install", "--config.auto-install-peers=false"],
    zodFreeTemporaryDirectory,
  );
  await writeFile(
    join(zodFreeTemporaryDirectory, "root-runtime-smoke.mjs"),
    `import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("zod"), { code: "MODULE_NOT_FOUND" });

const {
  validateResourceDocumentInvariants,
  walkResourceDocument,
} = await import("@oaknational/resource-document");
const document = {
  schemaVersion: "0.1",
  id: "zod-free-smoke",
  profile: "generic.v0",
  language: "en-GB",
  metadata: {},
  content: [{
    id: "paragraph",
    type: "paragraph",
    content: [{ type: "text", text: "No Zod required." }],
  }],
  answers: [],
  assets: [],
  provenance: {
    source: { system: "test", id: "zod-free-smoke" },
    producer: { name: "artifact-test", version: "1" },
  },
  diagnostics: [],
};

assert.deepEqual(
  Array.from(walkResourceDocument(document), (node) => node.id),
  ["paragraph"],
);
assert.deepEqual(validateResourceDocumentInvariants(document), []);
`,
  );
  run("node", ["root-runtime-smoke.mjs"], zodFreeTemporaryDirectory);

  const rootDeclaration = readPackedFile(uiTarball, "package/dist/index.d.ts");
  for (const exportName of [
    "getResourceAdapterCapabilities",
    "ResourceAdapterButton",
    "ResourceAdapterDialog",
    "ResourceAdapterErrorBoundary",
    "ResourceDocumentRenderer",
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
    "resource-document/ResourceDocumentRenderer.js",
    "capabilities/workflowRegistry.js",
    "capabilities/worksheet-scaffolding/WorksheetScaffoldingWorkflow.js",
    "capabilities/worksheet-scaffolding/useWorksheetScaffolding.js",
  ];
  const serverSafeModules = [
    "index.js",
    "client.js",
    "errors.js",
    "getResourceAdapterCapabilities.js",
    "getResourceAdapterCapabilityAvailability.js",
    "getResourceAdapterFeatureFlags.js",
    "worksheetScaffolding.js",
    "capabilities.js",
    "publicTypes.js",
    "requestId.js",
    "resource-document/InlineContentRenderer.js",
    "resource-document/ResourceNodeRenderer.js",
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
    .filter((path) => /^package\/dist\/.+\.js$/.test(path))
    .map((path) => path.replace("package/dist/", ""));
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
  await Promise.all([
    rm(temporaryDirectory, { force: true, recursive: true }),
    rm(zodFreeTemporaryDirectory, { force: true, recursive: true }),
  ]);
}
