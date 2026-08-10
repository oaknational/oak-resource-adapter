const affirmativeValues = new Set(["1", "true", "yes", "on"]);

/**
 * The unauthenticated `/dev` routes are opt-in: absent means closed, and so
 * does anything but an explicit affirmative. Coercing the string with `Boolean`
 * would open them for "0" and "false", which is the opposite of what someone
 * writing that in a production config intends.
 */
export function devRoutesEnabled(): boolean {
  const configured = process.env.ENABLE_DEV_ROUTES?.trim().toLowerCase() ?? "";

  return affirmativeValues.has(configured);
}

export function devRouteNotFound(): Response {
  return new Response(null, { status: 404 });
}
