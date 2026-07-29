# Release management

The current release policy, including when to enable the dormant
`ENFORCE_CHANGESETS` CI check, is in the shared [development
notes](../docs/DEVELOPMENT.md).

Once package publishing begins, add a changeset for each change to either
published package:

```sh
pnpm changeset
```

On merge to `main`, the [Release workflow](../.github/workflows/release.yml)
turns pending changesets into a "chore: version packages" PR; merging that PR
publishes both packages to npm. The step-by-step journey is described in the
[release workflow](../docs/RELEASE_WORKFLOW.md).
