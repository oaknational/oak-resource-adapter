import { hostRouter } from "@oaknational/resource-adapter-contracts/server";
import { raLogger } from "@oaknational/resource-adapter-logger";

import { createContextHost } from "@/context";
import { createTrpcRouteHandler } from "../../createTrpcRouteHandler";

const { GET, POST, OPTIONS } = createTrpcRouteHandler({
  router: hostRouter,
  endpoint: "/trpc/v1",
  log: raLogger("capabilities"),
  createContext: createContextHost,
});

export { GET, POST, OPTIONS };
