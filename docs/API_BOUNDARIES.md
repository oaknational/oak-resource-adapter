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

## Public vs. Internal tRPC Routers

The Resource Adapter API is split into two separate tRPC routers with distinct endpoints:

### Public API: `/trpc/v1` (Host-facing)

Served by `hostRouter` from `@oaknational/resource-adapter-contracts/server`.

- **Contract**: Immutable, versioned interface for external integrations (OWA)
- **Versioning**: When breaking changes are needed, a new `/trpc/v2` endpoint is created; v1 remains deployed for backward compatibility
- **Context**: `ResourceAdapterApiContextHost` (includes capabilities service + version checking)
- **Procedures**:
  - `capabilities.get` — Discover and manage lesson adaptations
- **Version Checking**: All requests must include the `x-resource-adapter-api-contract-version` header with value `1`

### Internal API: `/trpc/internal` (UI Component Private)

Served by `internalRouter` from `@oaknational/resource-adapter-contracts/server`.

- **Purpose**: Private infrastructure for UI component; never called by external hosts
- **Versioning**: Unversioned by default; can evolve freely
- **Context**: `ResourceAdapterApiContextInternal` (includes only feature flags service)
- **Procedures**:
  - `featureFlags.get` — Retrieve feature flags for authenticated teacher
- **Version Checking**: Not required; internal endpoints have no version contract
- **Future**: When new UI-private needs arise (analytics, caching, debug info), they belong here alongside feature flags

### Endpoint Derivation

The UI component automatically derives the internal endpoint from the public endpoint:

- Input: `https://api.example.com/resource-adapter/trpc/v1`
- Derived: `https://api.example.com/resource-adapter/trpc/internal`

This keeps the public interface stable while allowing the internal implementation to evolve independently.
