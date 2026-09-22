import { beforeAll, describe, expect, it, vi } from "vitest";

import type { generateDocx } from "../exports/docx";

import { ExportLimitError } from "../exports/limits";
import { docxArtifactFormat } from "../exports/formats";
import { prepareWorksheetExport } from "./export-service";
import {
  ADAPTATION_ID,
  DOCUMENT_ID,
  NEXT_DOCUMENT_ID,
  head,
  loadWorksheet,
  teacher,
} from "./test-doubles";
import type { getAdaptationHead } from "./repository";
import type { storeResourceArtifact } from "../resource-artifacts/service";

beforeAll(loadWorksheet);
const ARTIFACT_ID = "44444444-4444-4444-8444-444444444444";
const input = {
  adaptationId: ADAPTATION_ID,
  resourceDocumentId: DOCUMENT_ID,
  format: "docx",
} as const;

function dependencies() {
  return {
    getAdaptationHead: vi.fn<typeof getAdaptationHead>().mockResolvedValue(head()),
    generateDocx: vi
      .fn<typeof generateDocx>()
      .mockResolvedValue(new Uint8Array([1, 2, 3])),
    storeResourceArtifact: vi.fn<typeof storeResourceArtifact>().mockResolvedValue({
      id: ARTIFACT_ID,
      resourceDocumentId: DOCUMENT_ID,
      format: "docx",
      mimeType: docxArtifactFormat.mimeType,
      byteSize: 3,
      checksum: null,
      storageKey: "local/export",
      createdAt: new Date(),
    }),
  };
}

describe("worksheet export preparation", () => {
  it("renders and stores the owned snapshot without changing the adaptation", async () => {
    const deps = dependencies();
    const snapshot = head();
    deps.getAdaptationHead.mockResolvedValue(snapshot);
    const before = structuredClone(snapshot);
    expect(await prepareWorksheetExport(input, teacher, deps)).toEqual({
      artifactId: ARTIFACT_ID,
    });
    expect(deps.getAdaptationHead).toHaveBeenCalledWith(
      ADAPTATION_ID,
      teacher.teacherId,
    );
    expect(deps.generateDocx).toHaveBeenCalledWith(snapshot.storedDocument.document);
    expect(deps.storeResourceArtifact).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      DOCUMENT_ID,
      docxArtifactFormat.mimeType,
      "docx",
    );
    expect(snapshot).toEqual(before);
  });

  it("does not render missing or foreign adaptations", async () => {
    const deps = dependencies();
    deps.getAdaptationHead.mockResolvedValue(null);
    expect(await prepareWorksheetExport(input, teacher, deps)).toBeNull();
    expect(deps.generateDocx).not.toHaveBeenCalled();
  });

  it.each([
    { busy: true },
    { completedAt: null },
    { acceptedAt: null },
    { producingAdaptationId: "another-adaptation" },
  ])("rejects ineligible documents: %j", async (facts) => {
    const deps = dependencies();
    deps.getAdaptationHead.mockResolvedValue({ ...head(), ...facts });
    await expect(prepareWorksheetExport(input, teacher, deps)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(deps.generateDocx).not.toHaveBeenCalled();
  });

  it("rejects stale document identity even when the new head is accepted", async () => {
    const deps = dependencies();
    deps.getAdaptationHead.mockResolvedValue(head(NEXT_DOCUMENT_ID));
    await expect(prepareWorksheetExport(input, teacher, deps)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(deps.generateDocx).not.toHaveBeenCalled();
  });

  it("does not persist failed rendering and permits a new preparation attempt", async () => {
    const deps = dependencies();
    deps.generateDocx.mockRejectedValueOnce(new Error("renderer failed"));
    await expect(prepareWorksheetExport(input, teacher, deps)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(deps.storeResourceArtifact).not.toHaveBeenCalled();
    await expect(prepareWorksheetExport(input, teacher, deps)).resolves.toMatchObject({
      artifactId: ARTIFACT_ID,
    });
  });

  it("preserves the worksheet when storage fails", async () => {
    const deps = dependencies();
    const snapshot = head();
    deps.getAdaptationHead.mockResolvedValue(snapshot);
    const before = structuredClone(snapshot);
    deps.storeResourceArtifact.mockRejectedValueOnce(new Error("storage failed"));
    await expect(prepareWorksheetExport(input, teacher, deps)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(snapshot).toEqual(before);
    await expect(prepareWorksheetExport(input, teacher, deps)).resolves.toMatchObject({
      artifactId: ARTIFACT_ID,
    });
  });

  it("reports renderer limits without persisting an artifact", async () => {
    const deps = dependencies();
    deps.generateDocx.mockRejectedValueOnce(new ExportLimitError());
    await expect(prepareWorksheetExport(input, teacher, deps)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(deps.storeResourceArtifact).not.toHaveBeenCalled();
  });
});
