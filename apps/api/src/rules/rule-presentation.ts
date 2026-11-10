export function readableSlug(slug: string): string {
  const words = slug.replaceAll("-", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** Marks an identifier for the harness to show as code. */
export function code(identifier: string): string {
  return `\`${identifier}\``;
}
