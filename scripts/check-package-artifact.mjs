import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
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

function readPackedManifest(tarball) {
  return JSON.parse(
    execFileSync("tar", ["-xOf", tarball, "package/package.json"], {
      encoding: "utf8",
    }),
  );
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
          "@oaknational/oak-components": "^3.0.0",
          "@oaknational/resource-adapter-contracts": `file:${contractsTarball}`,
          "@oaknational/resource-adapter": `file:${uiTarball}`,
          next: "^16.1.0",
          "next-cloudinary": "^6.16.0",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          "styled-components": "^6.1.0",
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

  const packageEntryPoint = join(
    temporaryDirectory,
    "node_modules/@oaknational/resource-adapter/dist/index.js",
  );
  const packageExports = await import(pathToFileURL(packageEntryPoint).href);

  for (const exportName of [
    "getResourceAdapterCapabilities",
    "ResourceAdapterButton",
    "ResourceAdapterDialog",
    "createResourceAdapterClient",
  ]) {
    if (typeof packageExports[exportName] !== "function") {
      throw new Error(`Published package is missing ${exportName}.`);
    }
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
