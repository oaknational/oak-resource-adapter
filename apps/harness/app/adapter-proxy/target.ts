const defaultApiOrigin = "http://localhost:3001";

/**
 * Assigning `pathname` cannot change the origin. Resolving a path against a base
 * can — `new URL("https:/evil.test", base)` escapes to another host — and the
 * proxy sends a bypass secret to whatever it calls.
 */
export function buildApiTarget(segments: string[], search: string): URL {
  const target = new URL(process.env.RESOURCE_ADAPTER_API_ORIGIN ?? defaultApiOrigin);

  target.pathname = `/${segments.map(encodeURIComponent).join("/")}`;
  target.search = search;

  return target;
}
