import { z } from "zod";

import { adapterProxyPath } from "../../harness-api";
import type { ResourceDocument } from "@oaknational/resource-document";

export type DocxExportCommand = Readonly<{
  document: ResourceDocument;
  embedFigures: boolean;
}>;

const fallbackFilename = "resource-document.docx";

function safeFilename(value: string | undefined): string | undefined {
  if (
    value !== undefined &&
    value.length <= 180 &&
    /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*\.docx$/iu.test(value)
  ) {
    return value;
  }
  return undefined;
}

function downloadFilename(disposition: string | null): string {
  if (disposition === null) return fallbackFilename;

  const encoded = /(?:^|;)\s*filename\*=UTF-8'[^']*'([^;]+)/i.exec(disposition)?.[1];
  if (encoded !== undefined) {
    try {
      const filename = safeFilename(decodeURIComponent(encoded.trim()));
      if (filename !== undefined) return filename;
    } catch {
      // A malformed extended filename can still have a usable plain filename.
    }
  }

  const plain = /(?:^|;)\s*filename=(?:"([^"]*)"|([^;]*))/i.exec(disposition);
  return safeFilename((plain?.[1] ?? plain?.[2])?.trim()) ?? fallbackFilename;
}

export async function exportDocx(
  command: DocxExportCommand,
  signal?: AbortSignal,
): Promise<Readonly<{ blob: Blob; filename: string }>> {
  const response = await fetch(`${adapterProxyPath}/dev/exports/docx`, {
    body: JSON.stringify(command),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    ...(signal === undefined ? {} : { signal }),
  });

  if (response.status === 404) {
    throw new Error(
      "DOCX export is unavailable. Dev routes may be disabled or the export endpoint is not deployed.",
    );
  }
  if (!response.ok) {
    const parsed = z
      .object({ error: z.string() })
      .safeParse(await response.json().catch(() => null));
    throw new Error(
      parsed.success ? parsed.data.error : `The API returned HTTP ${response.status}.`,
    );
  }

  return {
    blob: await response.blob(),
    filename: downloadFilename(response.headers.get("content-disposition")),
  };
}
