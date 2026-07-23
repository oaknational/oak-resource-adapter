# Release management

The current release policy, including when to enable the dormant
`ENFORCE_CHANGESETS` CI check, is in the shared [development
notes](../docs/development.md).

Once package publishing begins, add a changeset for each change to either
published package:

```sh
pnpm changeset
```

At release time, run `pnpm changeset version`, commit the generated versions
and changelogs, then publish through the approved package-registry workflow.
