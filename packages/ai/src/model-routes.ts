import type { ModelId } from "./model-catalogue.js";

export type ModelRoute<TTransportId extends string = string> = Readonly<{
  model: ModelId;
  transport: TTransportId;
}>;

export type ModelRoutes = Readonly<Record<string, ModelRoute>>;

/**
 * Defines the central role-to-model mapping while preserving literal role and
 * transport names for callers of {@link createModelInvoker}.
 *
 * The provider is not declared here: it is derived from the model, so a route
 * cannot pair a model with the wrong provider.
 */
export function defineModelRoutes<const TRoutes extends ModelRoutes>(
  routes: TRoutes,
): TRoutes {
  return routes;
}

export type ModelRole<TRoutes extends ModelRoutes> = Extract<keyof TRoutes, string>;

export type ModelTransportId<TRoutes extends ModelRoutes> = Extract<
  TRoutes[keyof TRoutes]["transport"],
  string
>;
