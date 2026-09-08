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
