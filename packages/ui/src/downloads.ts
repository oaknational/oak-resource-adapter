function safeFilename(
  value: string | undefined,
  extension: string,
): string | undefined {
  if (
    value !== undefined &&
    value.length <= 180 &&
    /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*$/u.test(value) &&
    value.toLowerCase().endsWith(`.${extension}`)
  ) {
    return value;
  }
  return undefined;
}

export function downloadFilename(
  disposition: string | null,
  extension = "docx",
): string {
  if (!/^[a-z0-9]{1,16}$/.test(extension)) throw new Error("Invalid download format.");
  const fallbackFilename = `resource-document.${extension}`;
  if (disposition === null) return fallbackFilename;

  const encoded = /(?:^|;)\s*filename\*=UTF-8'[^']*'([^;]+)/i.exec(disposition)?.[1];
  if (encoded !== undefined) {
    try {
      const filename = safeFilename(decodeURIComponent(encoded.trim()), extension);
      if (filename !== undefined) return filename;
    } catch {
      // A malformed extended filename can still have a usable plain filename.
    }
  }

  const plain = /(?:^|;)\s*filename=(?:"([^"]*)"|([^;]*))/i.exec(disposition);
  return (
    safeFilename((plain?.[1] ?? plain?.[2])?.trim(), extension) ?? fallbackFilename
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Revoking on click or unmount can race the browser's download handoff.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
