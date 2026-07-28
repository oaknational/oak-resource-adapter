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
async function installedVersion(packageName) {
  const manifest = await readFile(
    join(repositoryRoot, "packages/ui/node_modules", packageName, "package.json"),
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
  const contractsManifest = readPackedManifest(contractsTarball);
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
          next: await installedVersion("next"),
          "next-cloudinary": await installedVersion("next-cloudinary"),
          react: await installedVersion("react"),
          "react-dom": await installedVersion("react-dom"),
          "styled-components": await installedVersion("styled-components"),
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

  const rootDeclaration = readPackedFile(uiTarball, "package/dist/index.d.ts");
  for (const exportName of [
    "getResourceAdapterCapabilities",
    "ResourceAdapterButton",
    "ResourceAdapterDialog",
  ]) {
    if (!rootDeclaration.includes(exportName)) {
      throw new Error(`Published package is missing ${exportName}.`);
    }
  }

  // App-router hosts need the directive on the UI bundle, while the client
  // bundle must stay free of it so it remains importable from server code.
  if (!readPackedFile(uiTarball, "package/dist/index.js").startsWith('"use client";')) {
    throw new Error('Published UI bundle is missing the "use client" directive.');
  }

  if (readPackedFile(uiTarball, "package/dist/client.js").startsWith('"use client";')) {
    throw new Error(
      'Published client bundle must not carry the "use client" directive.',
    );
  }

  const clientEntryPoint = join(
    temporaryDirectory,
    "node_modules/@oaknational/resource-adapter/dist/client.js",
  );
  const clientExports = await import(pathToFileURL(clientEntryPoint).href);

  if (typeof clientExports.createResourceAdapterClient !== "function") {
    throw new Error(
      "Published client entry point is missing createResourceAdapterClient.",
    );
  }

  console.log(`Verified package artifact: ${basename(uiTarball)}`);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
