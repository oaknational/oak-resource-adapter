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

  await writeFile(
    join(temporaryDirectory, "package.json"),
    JSON.stringify(
      {
        name: "resource-adapter-artifact-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@oaknational/oak-components": "^3.0.0",
          "@oaknational/resource-adapter": `file:${uiTarball}`,
          next: "^16.1.0",
          "next-cloudinary": "^6.16.0",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          "styled-components": "^6.1.0",
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
  ]) {
    if (typeof packageExports[exportName] !== "function") {
      throw new Error(`Published package is missing ${exportName}.`);
    }
  }

  console.log(`Verified package artifact: ${basename(uiTarball)}`);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
