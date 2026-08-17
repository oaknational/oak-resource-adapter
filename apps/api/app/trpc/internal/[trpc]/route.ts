import { internalRouter } from "@oaknational/resource-adapter-contracts/internal/server";
import { raLogger } from "@oaknational/resource-adapter-logger";

import { createContextInternal } from "@/context";
import { createTrpcRouteHandler } from "../../create-trpc-route-handler";

const { GET, POST, OPTIONS } = createTrpcRouteHandler({
  router: internalRouter,
  endpoint: "/trpc/internal",
  log: raLogger("internal-api"),
  createContext: createContextInternal,
});

export { GET, POST, OPTIONS };
