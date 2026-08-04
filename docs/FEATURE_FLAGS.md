# Feature flags

PostHog evaluates flags in production and `createInMemoryFeatureFlags` serves
development and tests, with `service.ts` choosing between them on `NODE_ENV` and
`USE_POSTHOG`.

## Flags control rollout, not authorisation

Rollout decides when a behaviour reaches a teacher. Authorisation decides
whether a request may act at all, and belongs in `authentication.ts` and the
`authenticatedProcedure` wrapping every route.

The separation is structural rather than conventional:

- **A flag is read only after authentication has passed.** The PostHog adapter
  requires a `teacherId` to evaluate anything.
- **Evaluation fails closed.** Any error from PostHog is reported and returns
  `false`, so an unreachable flag leaves the product behaving as it did before
  the flag existed.

## Naming

Lower-case and hyphenated, `<area>-<behaviour>`, phrased so the name reads as a
true statement when the flag is on:

```text
capabilities-worksheet-adapter    offers a capability to a teacher
generation-word-export            adds an artifact format alongside PDF
model-invocation-paused           stops invocation entirely
```

`false` is always current production behaviour, so the name describes the new or
exceptional path rather than the existing one.

| Avoid                      | Why                                        |
| -------------------------- | ------------------------------------------ |
| `worksheet-v2`             | Names a version rather than a behaviour.   |
| `enable-legacy-worksheets` | Off would mean the legacy path is on.      |
| `experiment-3`             | Carries no information about what changes. |

## The catalogue owns the list

`feature-flags.ts` is the register of record. Its keys generate `FeatureFlagKey`, so
reading an unregistered flag is a compile error rather than a silent `false`:

```ts
export const featureFlagCatalogue = {
  "feature-flags-smoke-test-enabled": {
    purpose: "Verifies feature-flag evaluation wiring across environments.",
    owner: "@person",
    default: false,
  },
} as const satisfies Readonly<Record<string, FeatureFlagCatalogueEntry>>;
```

- **`purpose`** states what the flag guards, so whoever retires it knows what
  they are deleting.
- **`owner`** is the GitHub handle of one person rather than a team, accountable
  for both the rollout and the removal. It is a required field rather than a
  comment, so a flag cannot be registered without one.
- **`default`** is the value used wherever PostHog is not consulted, and stays
  `false`.

## Adding a flag

1. Register the key in `feature-flags.ts` with its `purpose`, `owner`, and a `false`
   default.
2. Create the flag in PostHog under the same key before the code reading it
   ships. A key absent from PostHog evaluates `false`.

## Retiring a flag

1. Delete the branch and the function it guarded, leaving the kept behaviour
   unconditional, then remove the catalogue entry. The compiler finds every
   remaining reader.
2. Ship that change.
3. Delete the flag in PostHog.

Deleting the PostHog flag first is a silent rollback: evaluation falls to `false`
while the code still branches on it, reverting every teacher to the old
behaviour until the removal ships.

## Local development

The in-memory implementation is used unless `NODE_ENV=production` or
`USE_POSTHOG=true`, so developing either side of a flag needs no PostHog
credentials. `POSTHOG_API_KEY` and `POSTHOG_HOST` (defaulting to the EU host)
configure the adapter when it is used.
