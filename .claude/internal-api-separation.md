# Internal API Separation Architecture

## Overview

Separate the Resource Adapter API into two distinct tRPC routers:

1. **Public API** (`/trpc/v1`) — What OWA hosts call; minimal surface area
2. **Internal API** (`/trpc/internal`) — What the UI component uses privately; implementation details

## Motivation

- **Clean contracts**: OWA never sees feature flags, internal metadata, or UI-specific data
- **Explicit boundaries**: Clearly signal which endpoints are public vs. internal
- **Future-proof**: Internal endpoint becomes the home for any UI-private needs (analytics, usage tracking, caching layers, etc.)
- **Implementation privacy**: The UI component's internals stay private; hosts only interact with public capabilities

## Current State

Single router exposed at `/trpc/v1`:

```
/trpc/v1/capabilities.get    ← public (OWA calls this)
/trpc/v1/featureFlags.get    ← internal (UI component calls this)
```

Both mixed in the current single router.

## Target State

Two routers, two endpoints with clear versioning intent:

```
/trpc/v1/capabilities.get       ← public (versioned, OWA contract)
/trpc/internal/featureFlags.get ← internal (unversioned, private)
```

**Versioning strategy:**

- `/trpc/v1` is the immutable host-facing contract. Version checking happens at runtime. When v2 comes (breaking change), a new `/trpc/v2` endpoint will be created while v1 remains deployed.
- `/trpc/internal` is internal package infrastructure, unversioned. Can evolve freely without negotiation—future routes (analytics, caching, etc.) live here alongside feature flags.

### Internal Versioning Policy (Explicit)

To avoid accidental coupling between the public and internal contracts, apply these rules:

1. Keep `/trpc/internal` unversioned by default.
2. Do not require or validate the public contract header on internal calls.
3. Treat internal changes as additive by default (new optional fields/procedures are fine).
4. If an internal breaking change is unavoidable, introduce `/trpc/internal/v2` and dual-serve both versions during migration.
5. Remove the older internal version only after all supported UI package versions no longer depend on it.

This keeps the public host contract strict and immutable while still protecting deployed UI packages from API/UI rollout skew.

## Implementation Changes

### 1. Contracts Layer (`packages/contracts/src/server.ts`)

**Split the current router into two separate routers:**

- `hostRouter`: Only `capabilities` router
  - Public contract OWA hosts call
  - Immutable and versioned (`v1`)
  - What OWA depends on

- `internalRouter`: Only `featureFlags` router (and any future UI-private procedures)
  - Internal, not part of OWA contract
  - Private implementation detail of the UI component
  - Version-free; can evolve independently

**Before:**

```typescript
export const hostRouter = t.router({
  capabilities: t.router({ get: ... }),
  featureFlags: t.router({ get: ... }),
});
```

**After:**

```typescript
export const hostRouter = t.router({
  capabilities: t.router({ get: ... }),
});

export const internalRouter = t.router({
  featureFlags: t.router({ get: ... }),
});
```

#### 1.1 Context Design: Split Contexts (Chosen Approach)

Each router gets its own explicit context type, with shared types reused where possible.

**Implementation:**

```typescript
// Reused type and middleware
export type ResourceAdapterAuthenticatedTeacher = Readonly<{
  organisationId: string | null;
  teacherId: string;
}>;

export const authenticatedProcedure = versionedProcedure.use(({ ctx, next }) => {
  if (ctx.authenticatedTeacher === null) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
    });
  }
  return next({ ctx: { ...ctx, authenticatedTeacher: ctx.authenticatedTeacher } });
});

// Split contexts: each router has only what it needs
export type ResourceAdapterApiContextHost = Readonly<{
  apiContractVersion: number | null;
  authenticatedTeacher: ResourceAdapterAuthenticatedTeacher | null;
  capabilities: ResourceAdapterCapabilitiesService;
}>;

export type ResourceAdapterApiContextInternal = Readonly<{
  authenticatedTeacher: ResourceAdapterAuthenticatedTeacher | null;
  featureFlags: ResourceAdapterFeatureFlagService;
}>;

// Two separate tRPC instances, one per router
const t_host = initTRPC.context<ResourceAdapterApiContextHost>().create();
const t_internal = initTRPC.context<ResourceAdapterApiContextInternal>().create();

export const hostRouter = t_host.router({...});
export const internalRouter = t_internal.router({...});
```

**Benefits of this approach:**

- Type signature explicitly documents what each router depends on
- Prevents accidental cross-service usage (TypeScript error if internal router tries to call capabilities)
- Clearer, more maintainable architecture
- Better testability (easier to mock specific dependencies)
- Scales well if either router grows or needs different services in the future
- `ResourceAdapterAuthenticatedTeacher` type and `authenticatedProcedure` middleware are shared, so no duplication of auth logic

### 1.2 Router Names

✅ **FINAL DECISION:**

- **`hostRouter`** — The public contract that OWA hosts call to discover and manage lesson adaptations. Immutable, versioned, and the only thing hosts integrate with.
- **`internalRouter`** — Private infrastructure for the UI component. Feature flags, analytics, caching, and implementation details that hosts never see.

---

### 3. API Routes (`apps/api/app/trpc/`)

**Create new internal route handler:**

```
apps/api/app/trpc/internal/[trpc]/route.ts
```

Mirrors `/trpc/v1/[trpc]/route.ts` but mounts `internalRouter`.

**Keep existing public route:**

- `/trpc/v1/[trpc]/route.ts` remains unchanged structurally
- Now mounts only `hostRouter` (featureFlags removed)

### 4. UI Package (`packages/ui/src/getResourceAdapterFeatureFlags.ts`)

**Auto-derive internal endpoint:**

```typescript
export async function getResourceAdapterFeatureFlags({
  getToken,
  trpcEndpoint,
}: ResourceAdapterFeatureFlagsHostProps): Promise<ResourceAdapterFeatureFlagsResponse> {
  // Auto-derive internal endpoint from public endpoint
  const internalEndpoint = trpcEndpoint.replace("/trpc/v1", "/trpc/internal");

  try {
    return await createResourceAdapterClient({
      getToken,
      trpcEndpoint: internalEndpoint,
    }).featureFlags.get.query();
  } catch (error) {
    // ... error handling
  }
}
```

**No change to public props:**

- `ResourceAdapterHostProps` stays the same
- `trpcEndpoint` still points to `/trpc/v1`
- Internal routing is an implementation detail

### 5. Harness & Tests

**No breaking changes needed:**

- Harness already uses env vars: `NEXT_PUBLIC_RESOURCE_ADAPTER_TRPC_ENDPOINT`
- Local dev continues to work: `http://localhost:3001/trpc/v1` → internal derived as `http://localhost:3001/trpc/internal`
- Tests continue as-is; feature flag tests still work

**Add compatibility coverage:**

- Validate internal calls do not send or require the public contract-version header
- Add a regression test that verifies URL derivation (`/trpc/v1` → `/trpc/internal`)
- Keep a compatibility test path ready for future dual-serving (`/trpc/internal` + `/trpc/internal/v2`) when needed

### 6. Type Exports

**Shared types (reused by both routers):**

- `ResourceAdapterAuthenticatedTeacher` (both contexts reference this)
- `authenticatedProcedure` middleware (both routers use this)

**Split contexts (each router gets its own):**

- `ResourceAdapterApiContextHost` (only has `capabilities` service, plus version checking)
- `ResourceAdapterApiContextInternal` (only has `featureFlags` service)
- `ResourceAdapterAuthenticatedTeacher` shared in both

**Public exports (from `server.ts`):**

- `hostRouter` (public router, immutable)
- `HostRouter` type (what OWA depends on)

**New internal exports (from `server.ts`):**

- `internalRouter` (private router)
- `InternalRouter` type (for internal route handler)

**Feature flag types stay internal:**

- `resourceAdapterFeatureFlagsResponseSchema` in `internal.ts` (never exported from `index.ts`)
- Not part of public API surface ✓

## Deployment & Runtime

**Production URL transformation:**

Host provides (via env var):

```
https://resource-adapter-api.oak.academy/resource-adapter/trpc/v1
```

UI component derives:

```
https://resource-adapter-api.oak.academy/resource-adapter/trpc/internal
```

Same domain, different path. Works with any deployment topology.

## Benefits

| Aspect                     | Benefit                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| **Contract clarity**       | OWA sees only public API; no confusion about what's consumable          |
| **Version stability**      | Public API versioned; internal can evolve freely                        |
| **Security posture**       | Clearly signals internal vs. public; easier to audit                    |
| **Future extensibility**   | Internal endpoint is natural home for UI analytics, caching, debug info |
| **Backward compatible**    | Hosts need no changes; derived URL is transparent                       |
| **Implementation privacy** | Feature flag logic, selection criteria, etc. stay private               |

## Non-Breaking

- OWA integration stays identical
- Host props unchanged
- UI component API unchanged
- Just internal routing plumbing

## Decisions Made

✅ **Architecture:** Split into two routers (public + internal)  
✅ **Context Design:** Split contexts (not shared) — each router has its own explicit context type  
✅ **Router Names:** `hostRouter` (public) and `internalRouter` (private)

## Next Steps

1. Update `packages/contracts/src/server.ts` to split routers using `hostRouter` and `internalRouter`
2. Create `apps/api/app/trpc/internal/[trpc]/route.ts` with appropriate context factory
3. Update `packages/ui/src/getResourceAdapterFeatureFlags.ts` to auto-derive endpoint
4. Update test fixtures to verify both endpoints work
5. Update docs/API_BOUNDARIES.md to document the split and routing strategy
