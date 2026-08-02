# @oaknational/resource-adapter

React UI for Oak National Academy's Resource Adapter: the lesson-page entry
point (`ResourceAdapterButton`, `ResourceAdapterDialog`) and the
`getResourceAdapterCapabilities` helper for resolving what the service can do
for a lesson.

## Installation

```sh
pnpm add @oaknational/resource-adapter
```

This also installs `@oaknational/resource-adapter-contracts` (published from
the same repository as a fixed version pair) and `@trpc/client`.

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

The package ships one module per source file, and only the two component
modules carry a `"use client"` directive. In the Next.js app router the
components can be rendered directly from React Server Component trees, while
everything else, including `getResourceAdapterCapabilities`, stays callable
from server code:

```ts
import { getResourceAdapterCapabilities } from "@oaknational/resource-adapter";

const capabilities = await getResourceAdapterCapabilities({
  getToken,
  lesson,
  trpcEndpoint: "https://resource-adapter.example/trpc/v1",
});
```

The helper wraps the package's internal typed tRPC client, so hosts never
depend on `@trpc/client` themselves.

## Error handling and reporting

The components isolate their own render failures with a
`ResourceAdapterErrorBoundary`, so a crash inside the adapter cannot take down
the host lesson page. The dialog shows an accessible, Oak-styled unavailable
state (with a Try again control) in place of the crashed content; the button
hides itself.

To have caught errors reported, pass the dialog the same `getToken` and
`trpcEndpoint` used for `getResourceAdapterCapabilities`, plus an optional
`onError` for the host's own observability:

```tsx
<ResourceAdapterDialog
  capabilities={capabilities}
  getToken={getToken}
  isOpen={isOpen}
  lesson={lesson}
  onClose={close}
  onError={(error, info) => reportError(error, { componentStack: info.componentStack })}
  trpcEndpoint={trpcEndpoint}
/>
```

- **What gets reported to the Resource Adapter API**: the error name, its
  message (truncated to 500 characters) and the React component stack, nothing
  else. Tokens, lesson contents, prompts and personal data are excluded by
  construction: the strict wire schema has no field they could travel in. The
  call is authenticated with the host token, capped at five reports per page
  load, and failures in reporting are swallowed; they never affect the host
  page and are never themselves re-reported.
- **`onError` contract**: `(error: Error, info: { componentStack: string | null })`.
  Both arguments are plain serialisable values, never React types. The package
  never relies on it being called (consent-gated host reporters may no-op), and
  a throwing `onError` cannot break the fallback or the API report.
- **Reset semantics**: the boundary clears automatically when the dialog is
  closed or the lesson changes, and the fallback's Try again re-renders in
  place. `ResourceAdapterErrorBoundary` is also exported for hosts that want to
  wrap a larger surface; it accepts `resetKeys` (shallow-compared, any change
  clears the error), `fallback`, `onError` and `reporting` props.

**What error boundaries do not catch**: failed requests and other async
rejections, errors thrown in event handlers (including `ResourceAdapterButton`'s
`onClick`), server-side rendering errors, and errors inside the fallback
itself. Those paths keep their explicit error states, like
`getResourceAdapterCapabilities` throwing `ResourceAdapterApiError`.

## Testing local changes inside a host app like OWA

Sometimes it isn't enough to develop against the local harness and you need to
try changes inside a target app. You can do this with
[yalc](https://github.com/wclr/yalc). The full guide, including testing
contracts changes and the pre-publish flow, is in the
[UI local development workflow](https://github.com/oaknational/oak-resource-adapter/blob/main/docs/UI_LOCAL_DEVELOPMENT.md).

For UI-only changes (the published contracts package is fine as-is):

1. Install yalc: `pnpm i -g yalc`
2. Run `pnpm publish:local` in `packages/ui` to build the package and add it
   to yalc's local registry.
3. Inside the target app run `yalc add @oaknational/resource-adapter`, then
   `pnpm install`. The contracts dependency resolves from npm as usual.
   - If you're an Oak engineer developing in OWA, use the convenience script
     `pnpm use-local-resource-adapter` instead once the package is an OWA
     dependency, as it also removes any existing installation.
4. To pick up further changes, rebuild and run `yalc push` from `packages/ui`.
   It republishes and updates every linked app in one step.
5. When you're done, run `yalc remove @oaknational/resource-adapter` and
   `pnpm install` inside the target app.
   - In OWA use `pnpm remove-local-resource-adapter`, which also reinstalls
     the published package from npm.

When the local changes span both packages (or nothing is published yet), the
UI package's pinned contracts dependency must also point at the local copy:

1. Run `pnpm publish:local` in `packages/contracts` and then `packages/ui`.
2. In the target app run
   `yalc add @oaknational/resource-adapter-contracts @oaknational/resource-adapter`.
3. Add an override to the target app's `pnpm-workspace.yaml` so the UI
   package's own contracts dependency resolves to the linked copy (pnpm 11
   ignores `pnpm.overrides` in `package.json`):

   ```yaml
   overrides:
     "@oaknational/resource-adapter-contracts": "file:./.yalc/@oaknational/resource-adapter-contracts"
   ```

4. Run `pnpm install`. To undo, remove the override, run
   `yalc remove @oaknational/resource-adapter @oaknational/resource-adapter-contracts`,
   and run `pnpm install`.

## Releasing

Releases are automated with
[Changesets](https://github.com/changesets/changesets). Run `pnpm changeset`
at the repo root in any PR that changes this package or the contracts package,
describing the change and picking a semver bump; the two packages always
release together at the same version. On merge to `main`, CI opens (or
updates) a "chore: version packages" PR; merging that PR publishes to npm via
OIDC trusted publishing with provenance. No npm tokens are involved. See
[docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) for the release policy.
