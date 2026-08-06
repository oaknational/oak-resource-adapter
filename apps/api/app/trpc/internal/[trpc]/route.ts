import { internalRouter } from "@oaknational/resource-adapter-contracts/internal/server";
import { raLogger } from "@oaknational/resource-adapter-logger";

import { createContextInternal } from "../../../../src/context";
import { createTrpcRouteHandler } from "../../createTrpcRouteHandler";

const { GET, POST, OPTIONS } = createTrpcRouteHandler({
  router: internalRouter,
  endpoint: "/trpc/internal",
  log: raLogger("internal-api"),
  createContext: createContextInternal,
});

export { GET, POST, OPTIONS };
