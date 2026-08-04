# Feature flags

In production, flags are evaluated by PostHog.

In development and tests, we use `createInMemoryFeatureFlags`.

`service.ts` chooses which implementation to use based on `NODE_ENV` and
`USE_POSTHOG`.

## Flags control rollout, not authorisation

Flags are for rollout decisions, not access control.

Access control belongs in `authentication.ts` and in the
`authenticatedProcedure` used by the API routes.

Two practical rules:

- We only evaluate a flag after auth has passed. The PostHog adapter needs a
  `teacherId`.
- If PostHog fails, evaluation returns `false` and we log the error. That keeps
  behaviour on the safe/default path.

## Naming

Use lower-case, hyphenated names: `<area>-<behaviour>`.

Write the name so it reads like a true statement when the flag is on:

```text
capabilities-worksheet-adapter    offers a capability to a teacher
generation-word-export            adds an artifact format alongside PDF
model-invocation-paused           stops invocation entirely
```

`false` should represent current production behaviour. Name flags for the new or
exceptional path, not the existing one.

| Avoid                      | Why                                        |
| -------------------------- | ------------------------------------------ |
| `worksheet-v2`             | Names a version rather than a behaviour.   |
| `enable-legacy-worksheets` | Off would mean the legacy path is on.      |
| `experiment-3`             | Carries no information about what changes. |

## The catalogue owns the list

`apps/api/src/feature-flags/catalogue.ts` is the register of record. Its keys
generate `FeatureFlagKey`, so reading an unregistered flag is a compile error
rather than a silent `false`:

```ts
export const featureFlagCatalogue = {
  "feature-flags-smoke-test-enabled": {
    purpose: "Verifies feature-flag evaluation wiring across environments.",
    owner: "@person",
    default: false,
  },
} as const satisfies Readonly<Record<string, FeatureFlagCatalogueEntry>>;
```

- `purpose`: what the flag is guarding.
- `owner`: one GitHub handle (not a team alias), responsible for rollout and
  cleanup.
- `default`: fallback when PostHog is not used. Keep this `false`.

## Adding a flag

1. Register the key in `apps/api/src/feature-flags/catalogue.ts` with its
   `purpose`, `owner`, and a `false` default.
2. Create the flag in PostHog under the same key before the code reading it
   ships. A key absent from PostHog evaluates `false`.

## Retiring a flag

1. Delete the branch and the function it guarded, leaving the kept behaviour
   unconditional, then remove the catalogue entry. The compiler finds every
   remaining reader.
2. Ship that change.
3. Delete the flag in PostHog.

Do not delete the PostHog flag first. If you do, evaluation falls back to
`false` while the code still branches, which silently rolls teachers back to
the old path until code removal is deployed.

## Local development

The in-memory implementation is used unless `NODE_ENV=production` or
`USE_POSTHOG=true`, so developing either side of a flag needs no PostHog
credentials. `POSTHOG_API_KEY` and `POSTHOG_HOST` (defaulting to the EU host)
configure the adapter when it is used.

## Contract boundary

Flag names are service-owned and intentionally not part of the published
package API.

The contracts package only exposes the internal wire shape for enabled flag
names (`readonly string[]`).

See [API boundaries](API_BOUNDARIES.md).
