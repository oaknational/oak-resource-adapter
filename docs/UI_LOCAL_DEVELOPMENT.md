# UI local development workflow

This document describes how to test local, unpublished changes to
`@oaknational/resource-adapter` inside a host app such as OWA. For most work
the local harness (`pnpm dev`) is enough; reach for this workflow when a
change needs verifying against the real OWA integration before it is
released. How releases themselves work is covered in the
[release process](RELEASE_PROCESS.md).

## How yalc works

[yalc](https://github.com/wclr/yalc) is a small tool that acts like a local
npm registry. `yalc publish` packs a package exactly as npm would (it respects
the `files` field, so the host receives `dist`, `package.json`, README and
LICENSE) and stores it under `~/.yalc`. `yalc add` in a consuming app copies
that package into a `.yalc/` folder and points the app's `package.json` at it
with a `file:` path, so the next `pnpm install` treats it like any installed
dependency. OWA's `.gitignore`, ESLint and Jest configs already ignore
`.yalc/`, and `yalc.lock` is gitignored, so linking leaves no accidental
commits.

## Prerequisites

- yalc installed globally: `pnpm i -g yalc`
- This repository and OWA checked out on the same machine. They do not need
  to be sibling directories or share a parent: yalc's store lives in the
  user's home directory (`~/.yalc`), so any two checkout locations work.

## Testing UI-only changes

Use this flow when the contracts package is unchanged (its published version
is fine) and only the UI package has local changes.

1. In `packages/ui`, run `pnpm publish:local`. This builds the package and
   publishes it to yalc's local store.
2. In OWA, run `pnpm use-local-resource-adapter`. This removes the installed
   package and links the local copy. (Before the package is an OWA
   dependency, run `yalc add @oaknational/resource-adapter && pnpm install`
   instead, because `pnpm remove` fails on a package that is not installed.)
3. Start OWA as usual. The linked build is used wherever OWA imports
   `@oaknational/resource-adapter`.

The UI package's dependency on contracts resolves from the public registry as
normal, so no further setup is needed.

## Testing UI and contracts changes together

Use this flow when the local changes span both packages, or before the first
publish, when contracts does not exist on npm at all.

The extra step exists because yalc cannot resolve pnpm workspace versions:
the UI package's `workspace:*` dependency on contracts becomes `*` in the
linked copy, which pnpm tries (and pre-publish, fails) to resolve from the
registry. An override redirects it to the linked copy.

1. Run `pnpm publish:local` in `packages/contracts`, then in `packages/ui`.
2. In OWA, run
   `yalc add @oaknational/resource-adapter-contracts @oaknational/resource-adapter`.
3. Add an override to OWA's `pnpm-workspace.yaml`. It must go there, not in
   `package.json`: pnpm 11 ignores a `pnpm.overrides` field in
   `package.json`.

   ```yaml
   overrides:
     "@oaknational/resource-adapter-contracts": "file:./.yalc/@oaknational/resource-adapter-contracts"
   ```

4. Run `pnpm install`. Both packages now resolve to the linked copies,
   including the UI package's own contracts dependency.

## Iterating on changes

After further edits, rebuild and push from the changed package:

```sh
pnpm build && yalc push
```

`yalc push` republishes to the local store and updates every app that has the
package linked in one step, so there is no need to re-run `yalc add`.

## Cleaning up

In OWA:

1. Remove the override from `pnpm-workspace.yaml` if it was added.
2. Run `yalc remove @oaknational/resource-adapter` (and
   `@oaknational/resource-adapter-contracts` if linked), or the convenience
   script `pnpm remove-local-resource-adapter`.
3. Run `pnpm install` to reinstall the published packages.

`git status` in OWA should then show no changes from the linking session.

## Gotchas

- The host app must list `@oaknational/resource-adapter` in `transpilePackages`
  in its Next.js config (the harness already does). Without it, Next
  externalises the package on the server, and its oak-components import runs
  in plain Node ESM, which fails with `Cannot find module ... next/image` and
  a 500 on any page using the components.

- The override and the `.yalc/` folder are local-only test state. Never
  commit them.
- If OWA behaves as though changes are missing, re-run `pnpm build` and
  `yalc push` in the changed package; yalc serves whatever was last
  published, not the current source.
