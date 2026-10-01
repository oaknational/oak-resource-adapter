import { downloadFilename } from "@oaknational/resource-adapter/internal/downloads";

import { adapterProxyPath, readApiError } from "../../harness-api";
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
    throw await readApiError(response);
  }

  return {
    blob: await response.blob(),
    filename: downloadFilename(response.headers.get("content-disposition")),
  };
}
