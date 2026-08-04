# API boundaries

This repository has three API boundaries. Place code at the lowest boundary
that still serves the caller.

| Entry point                                        | Contents                                                   | Re-exportable to OWA |
| -------------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| `@oaknational/resource-adapter-contracts`          | Host-facing schemas and types                              | Yes                  |
| `@oaknational/resource-adapter-contracts/internal` | Browser-safe wire types for Resource Adapter-owned clients | No                   |
| `@oaknational/resource-adapter-contracts/server`   | Router, context, service boundaries                        | No                   |

## Placement rule

Pick the lowest boundary that needs the type or schema:

1. If OWA needs it, publish it from the root contracts entry point.
2. If only Resource Adapter-owned browser code needs it, place it in
   `contracts/internal`.
3. If only API runtime code needs it, place it in `contracts/server` or in
   `apps/api`.

## UI package public API

`packages/ui/src/index.ts` defines the published `@oaknational/resource-adapter`
surface.

- Treat changes there as explicit API changes.
- Internal helpers should remain unexported from that file.
