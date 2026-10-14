import type { TeacherAllowance } from "@oaknational/resource-adapter-contracts/internal";

import {
  callApi,
  createResourceAdapterInternalClient,
  type CreateResourceAdapterClientOptions,
} from "./client.js";

export type { TeacherAllowance } from "@oaknational/resource-adapter-contracts/internal";

export function getTeacherAllowance(
  options: CreateResourceAdapterClientOptions,
): Promise<TeacherAllowance> {
  return callApi("Resource Adapter could not load the teacher's allowance.", () =>
    createResourceAdapterInternalClient(options).allowance.get.query(),
  );
}
