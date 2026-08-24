# @oaknational/resource-adapter

React UI for Oak National Academy's Resource Adapter: the lesson-page entry
point (`ResourceAdapterButton`, `ResourceAdapterDialog`) and the
`getResourceAdapterCapabilities` helper for resolving what the service can do
for a lesson.

## Installation

```sh
pnpm add @oaknational/resource-adapter
```

This also installs `@oaknational/resource-adapter-contracts` and
`@oaknational/resource-document` (published from the same repository as a fixed
version group), plus `@trpc/client`.

Peer dependencies: `react` >=18.2, `react-dom` >=18.2, `next` >=14.2.12,
`next-cloudinary` >=6.16, `styled-components` >=5.3.11 and
`@oaknational/oak-components` ^3. The react and next floors mirror
oak-components' own peers, since it is the package's only React-facing
dependency; keep them in step when bumping it.

In a Next.js host, add the package to `transpilePackages` in the Next config
so the server build bundles it rather than loading it as external Node ESM:

```ts
transpilePackages: ["@oaknational/resource-adapter"],
```

## Usage

The package ships one module per source file. In the Next.js app router the
components can be rendered directly from React Server Component trees, while
everything else, including `getResourceAdapterCapabilities`, stays callable
from server code:

```ts
import {
  getResourceAdapterCapabilities,
  ResourceAdapterButton,
  ResourceAdapterDialog,
  type ResourceAdapterCapability,
} from "@oaknational/resource-adapter";
import { useState } from "react";

const capabilities = await getResourceAdapterCapabilities({
  apiBaseUrl: "https://resource-adapter.example",
  getToken,
  lesson,
});

const [selectedCapability, setSelectedCapability] =
  useState<ResourceAdapterCapability>();

<ResourceAdapterButton
  capabilities={capabilities.capabilities}
  onSelectCapability={setSelectedCapability}
/>;

{selectedCapability && (
  <ResourceAdapterDialog
    apiBaseUrl="https://resource-adapter.example"
    capability={selectedCapability}
    getToken={getToken}
    isOpen={true}
    lesson={lesson}
    onClose={() => {}}
  />
)}
```

The helper wraps the package's internal typed tRPC client, so hosts never
depend on `@trpc/client` themselves.

### Signed-out teachers

`getResourceAdapterCapabilities` needs a token. Before a teacher signs in, ask
`getResourceAdapterCapabilityAvailability` instead, which needs none:

```ts
const canOfferAdaptation = await getResourceAdapterCapabilityAvailability({
  apiBaseUrl: "https://resource-adapter.example",
  lesson,
});
```

It answers whether _this package version_ could render anything for the lesson,
so a sign-in prompt gated on it never leads a teacher to an empty dialog.

## Testing local changes inside a host app like OWA

Sometimes it isn't enough to develop against the local harness and you need to
try changes inside a target app. You can do this with
[yalc](https://github.com/wclr/yalc). The full guide, including testing
contracts changes and the pre-publish flow, is in the
[UI local development workflow](https://github.com/oaknational/oak-resource-adapter/blob/main/docs/UI_LOCAL_DEVELOPMENT.md).

For UI-only changes (the published contracts and document packages are fine
as-is):

1. Install yalc: `pnpm i -g yalc`
2. Run `pnpm publish:local` in `packages/ui` to build the package and add it
   to yalc's local registry.
3. Inside the target app run `yalc add @oaknational/resource-adapter`, then
   `pnpm install`. The contracts and document dependencies resolve from npm as
   usual.
   - If you're an Oak engineer developing in OWA, use the convenience script
     `pnpm use-local-resource-adapter` instead once the package is an OWA
     dependency, as it also removes any existing installation.
4. To pick up further changes, rebuild and run `yalc push` from `packages/ui`.
   It republishes and updates every linked app in one step.
5. When you're done, run `yalc remove @oaknational/resource-adapter` and
   `pnpm install` inside the target app.
   - In OWA use `pnpm remove-local-resource-adapter`, which also reinstalls
     the published package from npm.

When local changes span the published packages (or nothing is published yet),
the UI package's pinned contracts and document dependencies must also point at
the local copies:

1. Build and locally publish `packages/resource-document`, then
   `packages/contracts`, then `packages/ui`.
2. In the target app run
   `yalc add @oaknational/resource-document @oaknational/resource-adapter-contracts @oaknational/resource-adapter`.
3. Add an override to the target app's `pnpm-workspace.yaml` so the UI
   package's own contracts and document dependencies resolve to the linked
   copies (pnpm 11
   ignores `pnpm.overrides` in `package.json`):

   ```yaml
   overrides:
     "@oaknational/resource-document": "file:./.yalc/@oaknational/resource-document"
     "@oaknational/resource-adapter-contracts": "file:./.yalc/@oaknational/resource-adapter-contracts"
   ```

4. Run `pnpm install`. To undo, remove the override, run
   `yalc remove @oaknational/resource-adapter @oaknational/resource-adapter-contracts @oaknational/resource-document`,
   and run `pnpm install`.

## Releasing

Release automation uses [Changesets](https://github.com/changesets/changesets).
Run `pnpm changeset` at the repo root in any PR that changes this package, the
contracts package or the document package once Changesets enforcement is
enabled. Describe the change and choose a semver bump; the three packages
always release together at the same version. After a
tested release reaches `production`, CI opens or updates a "chore: version
packages" PR against `production`; merging that PR publishes to npm using OIDC
trusted publishing with provenance once release automation is enabled. No npm
token is involved. See the
[release process](../../docs/RELEASE_PROCESS.md) and the contributor guidance in
[development notes](../../docs/DEVELOPMENT.md).
