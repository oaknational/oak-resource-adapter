# @oaknational/resource-adapter-contracts

Shared tRPC contracts for Oak National Academy's Resource Adapter: the
browser-safe schemas and types (root entry) and the versioned tRPC router
definition (`./server` subpath, for the API service).

This package is published as a fixed version pair with
[`@oaknational/resource-adapter`](https://www.npmjs.com/package/@oaknational/resource-adapter),
which depends on it at runtime. Hosts such as OWA install the UI package and
receive this one transitively; it rarely needs installing directly.

## Entry points

```ts
// Browser-safe schemas, types, and the API contract version helpers.
import { lessonContextSchema } from "@oaknational/resource-adapter-contracts";

// Browser-safe, internal-only wire contracts for Resource Adapter-owned clients.
import { resourceAdapterFeatureFlagsResponseSchema } from "@oaknational/resource-adapter-contracts/internal";

// Server-only: the tRPC v1 router and API context types.
import { appRouterV1 } from "@oaknational/resource-adapter-contracts/server";
```

## Releasing

See the [UI package README](https://github.com/oaknational/oak-resource-adapter/tree/main/packages/ui#releasing);
both packages version and publish together via Changesets.
