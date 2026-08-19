import { defineRoleBindings } from "@oaknational/resource-adapter-ai";

import type { ModelInvoker, ModelRole } from "@oaknational/resource-adapter-ai";

/**
 * Every model role the service can ask for, and what each one currently runs on.
 * Application code names a role; changing the model or gateway behind it is an
 * edit here and nowhere else.
 */
export const modelRoleBindings = defineRoleBindings({
  "dev-smoke": {
    model: "gpt-5.6-luna",
    transport: "openai",
  },
  "worksheet-scaffold": {
    model: "gpt-5.6-luna",
    transport: "openai",
  },
});

export type ModelRoleName = ModelRole<typeof modelRoleBindings>;

export type ResourceAdapterModelInvoker = ModelInvoker<typeof modelRoleBindings>;

/** The roles a transformation definition may name. */
export const TRANSFORMATION_ROLES = [
  "worksheet-scaffold",
] as const satisfies readonly ModelRoleName[];

export type TransformationModelRole = (typeof TRANSFORMATION_ROLES)[number];

export const DEFAULT_TRANSFORMATION_ROLE: TransformationModelRole =
  "worksheet-scaffold";
