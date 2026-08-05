# Release management

The current release policy, including when to enable the dormant
`ENFORCE_CHANGESETS` CI check, is in the shared [development
notes](../docs/DEVELOPMENT.md).

Once package publishing begins, add a changeset for each change to either
published package:

```sh
pnpm changeset
```

Changesets accumulate on `main`. After QA merges a tested release branch into
`production`, the [Release workflow](../.github/workflows/release.yml) turns them
into a "chore: version packages" pull request against `production`. Merging that
pull request publishes both packages to npm.

See the [release process](../docs/RELEASE_PROCESS.md) for the operational
sequence and the [development notes](../docs/DEVELOPMENT.md) for contributor
guidance.
