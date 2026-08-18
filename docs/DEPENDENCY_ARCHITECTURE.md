# Dependency architecture

Workspace dependencies point from applications and orchestration code towards
smaller contracts and capabilities. A package must not reach back into an app,
and apps must not import one another.

The approved workspace edges are:

| Unit                                   | May depend on                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/api`                             | `ai`, `contracts`, `db`, `logger`, `original-resource-documents`, `resource-document` |
| `apps/harness`                         | `logger`, `original-resource-documents`, `resource-document`, `ui`                    |
| `packages/ai`                          | `db`, `logger`, `resource-document`                                                   |
| `packages/contracts`                   | `resource-document`                                                                   |
| `packages/curriculum`                  | `logger`                                                                              |
| `packages/db`                          | `logger`                                                                              |
| `packages/logger`                      | no workspace package                                                                  |
| `packages/original-resource-documents` | `resource-document`                                                                   |
| `packages/resource-document`           | no workspace package                                                                  |
| `packages/ui`                          | `contracts`; `resource-document` types only                                           |

This is an allowlist, not a requirement to introduce every edge. In particular,
`resource-document` is application-agnostic: ORA owns persistence,
transformations and delivery, while the package owns only the stable document
contract and parsing boundary.

## Using a private package from a published one

`contracts` and `ui` are published to npm; `resource-document` is currently
private at `0.0.0`. This is a packaging constraint, not a secrecy boundary: ORA
code should freely use the document model where appropriate. A published
artifact must nevertheless be installable by OWA. Until `resource-document` is
published or deliberately bundled, an emitted runtime or declaration import
would refer to a package OWA cannot install from the registry.

`pnpm test:artifact` currently fails on the two published surfaces that can
expose that unresolved reference:

- a **published manifest** declaring it, because `pnpm pack` rewrites
  `workspace:*` to the resolved `0.0.0`. Keep it a `devDependency`; consumers
  never install those.
- a **published declaration** naming it, because `tsc` emits the module
  specifier for any exported type that mentions it. Internal use is invisible in
  the emitted `.d.ts`; a public signature is not. `import type` does not help
  here — the declaration still carries the specifier.

Runtime source in a published package must additionally use a declared runtime
dependency or deliberately bundle the implementation; dependency checks reject
runtime imports from dev-only dependencies. When ORA intentionally makes the
document package available to OWA, these private-package checks should be
replaced by the chosen published or bundled packaging arrangement.

For now, Dependency Cruiser permits `packages/ui` to use only type-only imports
from `resource-document`. A runtime import fails `pnpm deps:check`. Breaking that
rule requires a deliberate decision to either bundle the required browser-safe
implementation into the UI artifact or publish `resource-document` as an
installable runtime dependency. OWA still consumes only the UI package's public
entry points in either case.

Consumers use package exports rather than internal files. The dependency check
derives each allowed entry point from the package's `exports` map, so adding a
new public subpath is a deliberate manifest change. Package code may still use
its own internal modules.

## Enforcement

Run:

```sh
pnpm deps:check
```

CI runs the same command. It verifies that:

- actual workspace imports follow the allowlist;
- UI imports from `resource-document` remain type-only;
- workspace dependencies are both declared and used;
- consumers do not bypass package exports with deep imports;
- runtime cycles are not introduced;
- imports resolve and external packages are declared;
- production code does not import tests or dev-only dependencies;
- packages are not accidentally assigned conflicting dependency roles; and
- portable published package code does not import Node.js built-ins; and
- deprecated Node.js core modules or npm packages are not introduced.

`pnpm test:artifact` covers what only the packed tarballs can show, including
the private-package rules above.

There is one documented runtime-cycle exception. Four Drizzle table modules
form a foreign-key cycle: `adaptations`, `resource-documents`,
`transformation-attempts` and `transformations`. The rules allow that exact
group but fail if the cycle expands or detours through another module.

When a new package is added, add its intended edges to
[`dependency-cruiser.config.mjs`](../dependency-cruiser.config.mjs). The
workspace-manifest check discovers package manifests and source roots
automatically.
