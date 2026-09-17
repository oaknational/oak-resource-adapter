const maxFilenameStem = 100;
const trimmedEdge = new Set(["_", "-"]);

function filenameStem(title: string, disallowed: RegExp): string {
  const characters = Array.from(title.replace(disallowed, "-")).slice(
    0,
    maxFilenameStem,
  );
  let start = 0;
  let end = characters.length;
  while (start < end && trimmedEdge.has(characters[start]!)) start += 1;
  while (end > start && trimmedEdge.has(characters[end - 1]!)) end -= 1;
  return characters.slice(start, end).join("");
}

/**
 * The quoted filename must stay ASCII and free of header syntax. RFC 6266's
 * extended form carries the untransliterated title for readers that accept it.
 */
export function attachmentDisposition(title: string | null, extension: string): string {
  if (!/^[a-zA-Z0-9]{1,16}$/.test(extension))
    throw new Error("Invalid artifact format.");
  const ascii = filenameStem(title ?? "", /[^a-zA-Z0-9_-]+/g) || "resource";
  const unicode = filenameStem(title ?? "", /[^\p{L}\p{N}_-]+/gu);
  const disposition = `attachment; filename="${ascii}.${extension}"`;
  if (!unicode || unicode === ascii) {
    return disposition;
  }
  const encoded = encodeURIComponent(`${unicode}.${extension}`);
  return `${disposition}; filename*=UTF-8''${encoded}`;
}
