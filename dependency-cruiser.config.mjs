import { existsSync, readdirSync, readFileSync } from "node:fs";

const workspaceUnits = {
  "apps/api": [
    "packages/ai",
    "packages/contracts",
    "packages/curriculum",
    "packages/db",
    "packages/logger",
    "packages/original-resource-documents",
    "packages/resource-document",
  ],
  "apps/harness": [
    "packages/logger",
    "packages/original-resource-documents",
    "packages/resource-document",
    "packages/ui",
  ],
  "packages/ai": ["packages/db", "packages/logger", "packages/resource-document"],
  "packages/contracts": ["packages/resource-document"],
  "packages/curriculum": ["packages/logger"],
  "packages/db": ["packages/logger"],
  "packages/logger": [],
  "packages/original-resource-documents": ["packages/resource-document"],
  "packages/resource-document": [],
  "packages/ui": ["packages/contracts", "packages/resource-document"],
};

// Rules are generated per entry above, so a unit missing from the map has no
// import allowlist and no deep-import guard, and deps:check still passes.
const undeclaredUnits = ["apps", "packages"]
  .flatMap((group) =>
    readdirSync(new URL(`./${group}/`, import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${group}/${entry.name}`),
  )
  .filter((unit) => existsSync(new URL(`./${unit}/package.json`, import.meta.url)))
  .filter((unit) => !Object.hasOwn(workspaceUnits, unit));

if (undeclaredUnits.length > 0) {
  throw new Error(
    `Add these to workspaceUnits in dependency-cruiser.config.mjs, or they go unchecked: ${undeclaredUnits.join(", ")}`,
  );
}

const packageDirectories = Object.keys(workspaceUnits).filter((directory) =>
  directory.startsWith("packages/"),
);

const intentionalDrizzleCycle =
  "^packages/db/src/schema/(?:adaptations|resource-documents|transformation-attempts|transformations)[.]ts$";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asPathExpression(paths) {
  return `^(?:${paths.map(escapeRegExp).join("|")})(?:/|$)`;
}

function collectExportTargets(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectExportTargets);
  }

  return [];
}

function publicModulePaths(packageDirectory) {
  const packageJson = JSON.parse(
    readFileSync(new URL(`./${packageDirectory}/package.json`, import.meta.url)),
  );

  const distributionPaths = collectExportTargets(packageJson.exports)
    .filter((target) => target.startsWith("./dist/"))
    .map((target) => `${packageDirectory}/${target.slice(2)}`);
  const sourcePaths = distributionPaths.map((target) =>
    target
      .replace(`${packageDirectory}/dist/`, `${packageDirectory}/src/`)
      .replace(/\.d\.ts$/, ".ts")
      .replace(/\.js$/, ".ts"),
  );

  return [...new Set([...distributionPaths, ...sourcePaths])];
}

const workspaceBoundaryRules = Object.entries(workspaceUnits).map(
  ([unit, allowedDependencies]) => ({
    name: `only-approved-workspace-dependencies-from-${unit.replaceAll("/", "-")}`,
    severity: "error",
    comment: `${unit} can only import its explicitly approved workspace dependencies.`,
    from: { path: `^${escapeRegExp(unit)}/` },
    to: {
      path: "^(?:apps|packages)/",
      pathNot: asPathExpression([unit, ...allowedDependencies]),
    },
  }),
);

const publicEntryPointRules = packageDirectories.map((packageDirectory) => ({
  name: `no-deep-imports-into-${packageDirectory.replace("packages/", "")}`,
  severity: "error",
  comment: `${packageDirectory} consumers must use entry points declared in its package exports.`,
  from: { pathNot: `^${escapeRegExp(packageDirectory)}/` },
  to: {
    path: `^${escapeRegExp(packageDirectory)}/(?:src|dist)/`,
    pathNot: `^(?:${publicModulePaths(packageDirectory).map(escapeRegExp).join("|")})$`,
  },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    ...workspaceBoundaryRules,
    ...publicEntryPointRules,
    {
      name: "ui-may-only-import-resource-document-types",
      severity: "error",
      comment:
        "The published UI may use resource-document types internally, but runtime use requires an explicit bundling or publication decision.",
      from: { path: "^packages/ui/src/" },
      to: {
        path: "^packages/resource-document/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "no-circular-runtime-dependencies",
      severity: "error",
      comment:
        "Runtime dependency cycles make ownership and initialization order ambiguous. The documented four-table Drizzle foreign-key cycle is the sole exception.",
      from: {
        pathNot: intentionalDrizzleCycle,
      },
      to: {
        circular: true,
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "no-expansion-of-intentional-drizzle-cycle",
      severity: "error",
      comment:
        "The intentional four-table Drizzle foreign-key cycle must not grow to include other modules.",
      from: { path: intentionalDrizzleCycle },
      to: {
        circular: true,
        pathNot: intentionalDrizzleCycle,
      },
    },
    {
      name: "no-detours-in-intentional-drizzle-cycle",
      severity: "error",
      comment:
        "The intentional four-table Drizzle foreign-key cycle must not pass through other modules.",
      from: { path: intentionalDrizzleCycle },
      to: {
        circular: true,
        via: { pathNot: intentionalDrizzleCycle },
      },
    },
    {
      name: "no-undeclared-dependencies",
      severity: "error",
      comment:
        "Every external dependency must be declared by the workspace unit that imports it.",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "no-unresolvable-imports",
      severity: "error",
      comment: "All imports must resolve to a module on disk.",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-production-imports-from-tests",
      severity: "error",
      comment:
        "Production modules cannot depend on test modules; extract shared helpers into production code.",
      from: {
        path: "^(?:apps/[^/]+/(?:app|src|workflows)|packages/[^/]+/src)/",
        pathNot: ["[.](?:spec|test)[.](?:[cm]?[jt]s|[jt]sx)$", "[.]d[.]ts$"],
      },
      to: { path: "[.](?:spec|test)[.](?:[cm]?[jt]s|[jt]sx)$" },
    },
    {
      name: "no-production-imports-from-dev-dependencies",
      severity: "error",
      comment:
        "Runtime code must not rely on packages installed only as development dependencies.",
      from: {
        path: "^(?:apps/[^/]+/(?:app|src|workflows)|packages/[^/]+/src)/",
        pathNot: ["[.](?:spec|test)[.](?:[cm]?[jt]s|[jt]sx)$", "[.]d[.]ts$"],
      },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["npm-peer", "type-only"],
        pathNot: "node_modules/@types/",
      },
    },
    {
      name: "no-accidental-duplicate-dependency-types",
      severity: "error",
      comment:
        "A package should have one dependency role; peer plus dev is intentionally allowed for package development.",
      from: {},
      to: {
        moreThanOneDependencyType: true,
        dependencyTypesNot: ["npm-peer", "type-only"],
      },
    },
    {
      name: "no-deprecated-node-core-modules",
      severity: "error",
      comment: "Deprecated Node.js core modules must not be introduced.",
      from: {},
      to: {
        dependencyTypes: ["core"],
        path: ["^(?:constants|domain|punycode|sys|_linklist|_stream_wrap)$"],
      },
    },
    {
      name: "no-node-builtins-in-portable-packages",
      severity: "error",
      comment:
        "Published contracts, UI and document-model runtime code must remain portable across browser and server environments.",
      from: {
        path: "^packages/(?:contracts|resource-document|ui)/src/",
        pathNot: [
          "^packages/resource-document/src/fixtures/",
          "[.](?:spec|test)[.](?:[cm]?[jt]s|[jt]sx)$",
        ],
      },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "no-deprecated-npm-dependencies",
      severity: "error",
      comment: "Deprecated npm packages must not be introduced into source code.",
      from: {},
      to: { dependencyTypes: ["deprecated"] },
    },
  ],
  options: {
    doNotFollow: {
      path: ["node_modules", "^packages/[^/]+/dist/"],
    },
    exclude: {
      path: ["(^|/)(?:coverage|[.]next)/", "^apps/api/app/[.]well-known/workflow/"],
    },
    tsConfig: { fileName: "tsconfig.dependency-cruiser.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      conditionNames: ["types", "import", "default"],
      exportsFields: ["exports"],
    },
  },
};
