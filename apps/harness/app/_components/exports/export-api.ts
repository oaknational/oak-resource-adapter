import { downloadFilename } from "@oaknational/resource-adapter/internal/downloads";
import { z } from "zod";

import { adapterProxyPath } from "../../harness-api";
import type { ResourceDocument } from "@oaknational/resource-document";

export type DocxExportCommand = Readonly<{
  document: ResourceDocument;
  embedFigures: boolean;
}>;

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
