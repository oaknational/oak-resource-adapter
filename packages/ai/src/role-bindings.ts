import type { ModelId } from "./model-catalogue.js";

export type RoleBinding<TTransportId extends string = string> = Readonly<{
  model: ModelId;
  transport: TTransportId;
}>;

export type RoleBindings = Readonly<Record<string, RoleBinding>>;

/**
 * Binds logical roles to models and transports while preserving their literal
 * names for callers of {@link createModelInvoker}.
 *
 * The provider is not declared here: it is derived from the model, so a binding
 * cannot pair a model with the wrong provider.
 */
export function defineRoleBindings<const TBindings extends RoleBindings>(
  bindings: TBindings,
): TBindings {
  return bindings;
}

export type ModelRole<TBindings extends RoleBindings> = Extract<
  keyof TBindings,
  string
>;

export type ModelTransportId<TBindings extends RoleBindings> = Extract<
  TBindings[keyof TBindings]["transport"],
  string
>;
