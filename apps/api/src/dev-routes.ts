/**
 * The unauthenticated `/dev` routes are opt-in: absent means closed.
 */
export function devRoutesEnabled(): boolean {
  return Boolean(process.env.ENABLE_DEV_ROUTES);
}

export function devRouteNotFound(): Response {
  return new Response(null, { status: 404 });
}
