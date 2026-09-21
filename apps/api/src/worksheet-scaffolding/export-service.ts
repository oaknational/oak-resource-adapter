import { downloadAvailability } from "./download-availability";
import type { WorksheetExportRequest } from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import { parseResourceDocument } from "@oaknational/resource-document/parse";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { TRPCError } from "@trpc/server";

import { generateDocx } from "../exports/docx";
import { docxArtifactFormat } from "../exports/formats";
import { ExportLimitError } from "../exports/limits";
import { storeResourceArtifact } from "../resource-artifacts/service";
import { getAdaptationHead } from "./repository";

const log = raLogger("internal-api");

const defaults = { getAdaptationHead, generateDocx, storeResourceArtifact };

export async function prepareWorksheetExport(
  input: WorksheetExportRequest,
  teacher: ResourceAdapterAuthenticatedTeacher,
  dependencies = defaults,
) {
  const head = await dependencies.getAdaptationHead(
    input.adaptationId,
    teacher.teacherId,
  );
  if (head === null) return null;
  if (
    head.storedDocument.id !== input.resourceDocumentId ||
    downloadAvailability(head) !== "available"
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "The worksheet has changed or is not ready to download. Refresh it and try again.",
    });
  }

  // Rendering and storage use the immutable snapshot, without holding a database transaction.
  try {
    const started = performance.now();
    const bytes = await dependencies.generateDocx(
      parseResourceDocument(head.storedDocument.document),
    );
    const renderMs = performance.now() - started;
    const artifact = await dependencies.storeResourceArtifact(
      bytes,
      head.storedDocument.id,
      docxArtifactFormat.mimeType,
      docxArtifactFormat.format,
    );
    log.info("Prepared worksheet DOCX", {
      renderMs: Math.round(renderMs),
      preparationMs: Math.round(performance.now() - started),
      byteSize: bytes.byteLength,
    });
    return { artifactId: artifact.id };
  } catch (cause) {
    throw new TRPCError({
      code:
        cause instanceof ExportLimitError
          ? "PAYLOAD_TOO_LARGE"
          : "INTERNAL_SERVER_ERROR",
      message:
        cause instanceof ExportLimitError
          ? "This worksheet exceeds DOCX export limits."
          : "The DOCX could not be prepared. Your worksheet is saved; try again.",
      cause,
    });
  }
}
