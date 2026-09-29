import type { WorksheetDownloadAvailability } from "@oaknational/resource-adapter-contracts/internal";

import type { StoredAdaptationHead } from "./repository";

export function downloadAvailability(
  head: StoredAdaptationHead,
): WorksheetDownloadAvailability {
  if (
    head.adaptation.abandonedAt !== null ||
    head.adaptation.capabilityId !== "worksheetScaffolding"
  )
    return "unavailable";
  if (head.storedDocument.origin !== "generated") return "original";
  if (head.busy) return "busy";
  if (head.producingAdaptationId !== head.adaptation.id || head.completedAt === null)
    return "unavailable";
  if (head.acceptedAt === null) return "review";
  return "available";
}
