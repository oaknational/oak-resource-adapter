# API boundaries

The contracts package has four entry points. Place code at the lowest boundary
that still serves the caller.

| Entry point                                               | Contents                                                   | Re-exportable to OWA |
| --------------------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| `@oaknational/resource-adapter-contracts`                 | Host-facing schemas and types                              | Yes                  |
| `@oaknational/resource-adapter-contracts/internal`        | Browser-safe wire types for Resource Adapter-owned clients | No                   |
| `@oaknational/resource-adapter-contracts/server`          | Host router, context, service boundaries                   | No                   |
| `@oaknational/resource-adapter-contracts/internal/server` | Internal router, context, service boundaries               | No                   |

## Placement rule

Pick the lowest boundary that needs the type or schema:

1. If OWA needs it, publish it from the root contracts entry point.
2. If only Resource Adapter-owned browser code needs it, place it in
   `contracts/internal`.
3. If only the public API runtime needs it, place it in `contracts/server`.
4. If only the internal API runtime needs it, place it in
   `contracts/internal/server`.
5. If it is an implementation detail rather than a contract, keep it in
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

Served by `internalRouter` from `@oaknational/resource-adapter-contracts/internal/server`.

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

## Deployment and consumer model

OWA is the only host consumer. It calls the versioned public API through the
published UI package; it does not call the internal API directly.

The internal API is consumed only by Resource Adapter-owned UI code and remains
unversioned on the assumption that compatible UI and API changes are deployed
together in OWA. If another consumer or an independent deployment lifecycle is
introduced, revisit this decision and add an internal compatibility version.
