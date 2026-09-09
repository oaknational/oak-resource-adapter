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
  "lesson-transcript-summary": {
    model: "gpt-5.6-luna",
    transport: "openai",
  },
  "worksheet-scaffold": {
    model: "gpt-5.6-luna",
    transport: "openai",
  },
  "worksheet-scaffolding-suggester": {
    model: "gpt-5.6-luna",
    transport: "openai",
  },
});

export type ModelRoleName = ModelRole<typeof modelRoleBindings>;

type RebindTransport<TTransport extends string> = {
  [Role in ModelRoleName]: Readonly<{
    model: (typeof modelRoleBindings)[Role]["model"];
    transport: TTransport;
  }>;
};

/** Every role on its usual model, routed through a different transport. */
export function rebindModelRoles<const TTransport extends string>(
  transport: TTransport,
): RebindTransport<TTransport> {
  return Object.fromEntries(
    Object.entries(modelRoleBindings).map(([role, { model }]) => [
      role,
      { model, transport },
    ]),
  ) as RebindTransport<TTransport>;
}

export type ResourceAdapterModelInvoker = ModelInvoker<typeof modelRoleBindings>;

export type ModelInvokerConfig = Readonly<{
  createInvoker: () => ResourceAdapterModelInvoker;
}>;

export const TRANSFORMATION_ROLES = [
  "worksheet-scaffold",
] as const satisfies readonly ModelRoleName[];

export type TransformationModelRole = (typeof TRANSFORMATION_ROLES)[number];

export const DEFAULT_TRANSFORMATION_ROLE: TransformationModelRole =
  "worksheet-scaffold";

export const MATERIAL_ROLES = [
  "lesson-transcript-summary",
] as const satisfies readonly ModelRoleName[];

export type MaterialModelRole = (typeof MATERIAL_ROLES)[number];

export const DEFAULT_MATERIAL_ROLE: MaterialModelRole = "lesson-transcript-summary";

export const SUGGESTION_ROLES = [
  "worksheet-scaffolding-suggester",
] as const satisfies readonly ModelRoleName[];

export type SuggestionModelRole = (typeof SUGGESTION_ROLES)[number];
