# API boundaries

Resource Adapter UI code runs inside OWA. What a change costs depends on what has
to ship before it reaches teachers, and on whether it can be taken back:

- **OWA package bump required.** Two releases, in order.
- **Older copies of our package are still deployed.** One release, no take-backs.
- **Service only.** One release, revertible.

Everything below exists to keep changes in the third group.

## The two APIs

| Endpoint         | Router                                    | Called by                         | Versioned                                         |
| ---------------- | ----------------------------------------- | --------------------------------- | ------------------------------------------------- |
| `/trpc/v1`       | `hostRouter` from `…/server`              | OWA, via the published UI package | Yes, `x-resource-adapter-contract-version` header |
| `/trpc/internal` | `internalRouter` from `…/internal/server` | Resource Adapter UI code only     | No                                                |

A breaking change to the host router means a new `/trpc/v2` router. The existing
one stays deployed while any released package still calls it.

New UI-private procedures — analytics, debug state, communication from UI<->API —
go on `/trpc/internal`. Nothing stops OWA calling it: it is unsupported, not
unreachable.

## What may change without a version bump

The internal API has no version header, so a client and a service that disagree
cannot fail loudly the way the host router does. Two rules follow.

**Free to change: anything a client is built to tolerate not recognising.** An
unrecognised value must mean off, ignore, or not supported yet — never a crash.
Feature flags are the current example: retiring one makes an older client's check
return false, which is the intended end state.

**Not free to change: the shape of what crosses the wire.** Request and response
schemas stay additive and optional. The UI package and the service are published
together but not deployed together, and a rollback can put an old package in
front of a current service.

## Where contracts code lives

| Entry point                   | Contents                                     | For example                                 |
| ----------------------------- | -------------------------------------------- | ------------------------------------------- |
| `…-contracts`                 | Host-facing schemas and types                | `lessonContextSchema`                       |
| `…-contracts/internal`        | Wire types for our own clients, browser-safe | `resourceAdapterFeatureFlagsResponseSchema` |
| `…-contracts/server`          | Host router, context, service boundaries     | `hostRouter`                                |
| `…-contracts/internal/server` | Internal router, context, service boundaries | `ResourceAdapterFeatureFlagService`         |

Use the narrowest entry point that serves the callers, because only the root
entry may be re-exported to OWA. Implementation details are not contracts and
stay in `apps/api` — the feature flag catalogue, for instance.

## The published UI surface

`packages/ui/src/index.ts` is the public API of `@oaknational/resource-adapter`.
`index.test.ts` asserts its export list, so nothing widens it by accident.

## Endpoint construction

Hosts pass `apiBaseUrl`. The UI package appends `/trpc/v1` and `/trpc/internal`,
keeping any proxy path:

- `https://api.example.com` → `https://api.example.com/trpc/v1`
- `https://api.example.com/resource-adapter` →
  `https://api.example.com/resource-adapter/trpc/v1`

`normalizeApiBaseUrl` in [`packages/ui/src/client.ts`](../packages/ui/src/client.ts)
rejects a relative value, a non-http scheme, or one already carrying `/trpc`.
