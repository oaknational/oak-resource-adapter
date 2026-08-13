import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { cruise } from "dependency-cruiser";

import dependencyCruiserConfig from "../dependency-cruiser.config.mjs";

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

function readPackage(directory) {
  return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
}

function workspaceDirectories(parent) {
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${parent}/${entry.name}`)
    .filter((directory) => existsSync(join(directory, "package.json")));
}

function declaredDependencies(packageJson) {
  return new Set(
    dependencyFields.flatMap((field) => Object.keys(packageJson[field] ?? {})),
  );
}

const units = [...workspaceDirectories("apps"), ...workspaceDirectories("packages")];
const packagesByName = new Map(
  units.map((directory) => {
    const packageJson = readPackage(directory);
    return [packageJson.name, { directory, packageJson }];
  }),
);
const packagesByDirectory = new Map(
  [...packagesByName].map(([name, workspacePackage]) => [
    workspacePackage.directory,
    { name, ...workspacePackage },
  ]),
);
const sourceFileExtension = /[.](?:[cm]?[jt]s|[jt]sx)$/;
const sourceRoots = units.flatMap((unit) => {
  if (unit.startsWith("apps/")) {
    return [unit];
  }

  const sourceDirectories = ["src", "scripts"]
    .map((sourceDirectory) => `${unit}/${sourceDirectory}`)
    .filter(existsSync);
  const configurationFiles = readdirSync(unit, { withFileTypes: true })
    .filter((entry) => entry.isFile() && sourceFileExtension.test(entry.name))
    .map((entry) => `${unit}/${entry.name}`);

  return [...sourceDirectories, ...configurationFiles];
});

const cruiseResult = await cruise(
  sourceRoots,
  dependencyCruiserConfig.options,
  dependencyCruiserConfig.options.enhancedResolveOptions,
);
const usedWorkspaceDependencies = new Map(
  units.map((directory) => [directory, new Set()]),
);
const errors = [];

const unresolvedWorkspaceImports = new Set();

for (const module of cruiseResult.output.modules) {
  const sourceUnit = units.find((unit) => module.source.startsWith(`${unit}/`));
  if (!sourceUnit) {
    continue;
  }

  for (const dependency of module.dependencies) {
    if (dependency.couldNotResolve) {
      const workspaceName = [...packagesByName.keys()].find(
        (name) =>
          dependency.module === name || dependency.module?.startsWith(`${name}/`),
      );
      if (workspaceName) {
        unresolvedWorkspaceImports.add(workspaceName);
      }
      continue;
    }

    const targetUnit = units.find(
      (unit) =>
        dependency.resolved === unit || dependency.resolved?.startsWith(`${unit}/`),
    );
    if (!targetUnit || targetUnit === sourceUnit) {
      continue;
    }

    usedWorkspaceDependencies
      .get(sourceUnit)
      .add(packagesByDirectory.get(targetUnit).name);
  }
}

// Workspace imports resolve through each package's exports map, which points at
// dist. Unbuilt, every one of them resolves to nothing and every declared
// dependency then looks unused.
if (unresolvedWorkspaceImports.size > 0) {
  console.error(
    `Workspace packages did not resolve, so this check cannot run. Build them first with pnpm build.\n\nUnresolved: ${[...unresolvedWorkspaceImports].sort().join(", ")}`,
  );
  process.exit(1);
}

for (const unit of units) {
  const packageJson = readPackage(unit);
  const declared = declaredDependencies(packageJson);
  const declaredWorkspaceDependencies = new Set(
    [...declared].filter((dependency) => packagesByName.has(dependency)),
  );
  const used = usedWorkspaceDependencies.get(unit);

  for (const dependency of used) {
    if (!declaredWorkspaceDependencies.has(dependency)) {
      errors.push(`${unit} imports undeclared workspace package ${dependency}`);
    }
  }

  for (const dependency of declaredWorkspaceDependencies) {
    if (!used.has(dependency)) {
      errors.push(`${unit} declares unused workspace package ${dependency}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Workspace dependency manifest violations:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("Workspace dependency manifests match source imports.");
}
