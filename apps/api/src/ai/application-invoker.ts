import { createDatabaseInvocationRecorder } from "@oaknational/resource-adapter-ai";

import { createConfiguredModelInvoker } from "./configured-invoker";
import type { ResourceAdapterModelInvoker } from "./model-roles";

export function createApplicationModelInvoker(
  transformationAttemptId: string,
  teacherId: string,
): ResourceAdapterModelInvoker {
  return createConfiguredModelInvoker(
    () => createDatabaseInvocationRecorder({ transformationAttemptId }),
    teacherId,
  );
}
