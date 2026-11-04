import type { TransformationCatalogueItem } from "@oaknational/resource-adapter-dev-api-contracts";

import shared from "./shared.module.css";

export function SuggestionGuidance({
  guidance,
}: Readonly<{ guidance: TransformationCatalogueItem["suggestion"] }>) {
  if ("offer" in guidance) {
    return (
      <div className={shared.guidanceGrid}>
        <div className={shared.useGuidance}>
          <h4>Always offered</h4>
          <p>{guidance.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={shared.guidanceGrid}>
      <div className={shared.useGuidance}>
        <h4>Use when</h4>
        <p>{guidance.useWhen}</p>
      </div>
      <div className={shared.avoidGuidance}>
        <h4>Avoid when</h4>
        <p>{guidance.avoidWhen}</p>
      </div>
    </div>
  );
}
