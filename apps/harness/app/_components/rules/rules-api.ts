import {
  eligibilityEvaluationResponseSchema,
  ruleCatalogueSchema,
  teachingMaterialsCatalogueSchema,
  type EligibilityEvaluationRequest,
  type EligibilityEvaluationResponse,
  type RuleCatalogue,
  type TeachingMaterialsCatalogue,
} from "@oaknational/resource-adapter-dev-api-contracts";

import { adapterProxyPath, readApiResponse } from "../../harness-api";

export async function fetchRuleCatalogue(signal?: AbortSignal): Promise<RuleCatalogue> {
  const response = await fetch(
    `${adapterProxyPath}/dev/rules`,
    signal === undefined ? {} : { signal },
  );
  return readApiResponse(response, ruleCatalogueSchema, "the rule catalogue");
}

export async function fetchTeachingMaterialsCatalogue(): Promise<TeachingMaterialsCatalogue> {
  const response = await fetch(`${adapterProxyPath}/dev/rules/teaching-materials`);
  return readApiResponse(
    response,
    teachingMaterialsCatalogueSchema,
    "the labs teaching materials rules",
  );
}

export async function fetchEligibility(
  request: EligibilityEvaluationRequest,
  signal?: AbortSignal,
): Promise<EligibilityEvaluationResponse> {
  const response = await fetch(`${adapterProxyPath}/dev/rules/eligibility`, {
    body: JSON.stringify(request),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    ...(signal === undefined ? {} : { signal }),
  });
  return readApiResponse(
    response,
    eligibilityEvaluationResponseSchema,
    "an eligibility evaluation",
  );
}
