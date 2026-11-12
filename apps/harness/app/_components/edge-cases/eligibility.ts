import type {
  EligibilityEvaluationRequest,
  EligibilityEvaluationResponse,
  RuleCatalogue,
} from "@oaknational/resource-adapter-dev-api-contracts";

import { fetchEligibility, fetchRuleCatalogue } from "../rules/rules-api";
import { sentenceCase } from "../rules/rule-details";
import { capabilityScope, LESSON_SCOPE, ruleAnchor } from "../rules/rule-flow-model";

export type EligibilityLine = Readonly<{
  offered: boolean;
  subject: string;
  /** The rule that refused, with a link target on the rules page. */
  refusedBy?: Readonly<{ anchor: string; condition: string; reason: string }>;
}>;

/** One line for the lesson when it is refused, otherwise one per capability. */
export function describeEligibility(
  evaluation: EligibilityEvaluationResponse,
  catalogue: RuleCatalogue,
): readonly EligibilityLine[] {
  if (evaluation.lesson !== null) {
    const { reason, rule } = evaluation.lesson;
    return [
      {
        offered: false,
        subject: "ORA",
        refusedBy: {
          anchor: ruleAnchor(LESSON_SCOPE, rule),
          condition: catalogue.lesson.find(({ id }) => id === rule)?.condition ?? rule,
          reason: sentenceCase(reason),
        },
      },
    ];
  }
  return evaluation.capabilities.map(({ id, refusal }) => {
    const capability = catalogue.capabilities.find((candidate) => candidate.id === id);
    const subject = capability?.label ?? id;
    if (refusal === null) {
      return { offered: true, subject };
    }
    return {
      offered: false,
      subject,
      refusedBy: {
        anchor: ruleAnchor(capabilityScope(id), refusal.rule),
        condition:
          capability?.rules.find((rule) => rule.id === refusal.rule)?.condition ??
          refusal.rule,
        reason: sentenceCase(refusal.reason),
      },
    };
  });
}

export type EvaluatedEligibility = Readonly<{
  catalogue: RuleCatalogue;
  evaluation: EligibilityEvaluationResponse;
}>;

const apiFetchers = { catalogue: fetchRuleCatalogue, eligibility: fetchEligibility };

/** `null` once `signal` aborts, so a response for an earlier lesson can't replace a later one. */
export async function loadEligibility(
  request: EligibilityEvaluationRequest,
  signal: AbortSignal,
  fetchers: typeof apiFetchers = apiFetchers,
): Promise<EvaluatedEligibility | null> {
  const [catalogue, evaluation] = await Promise.all([
    fetchers.catalogue(signal),
    fetchers.eligibility(request, signal),
  ]);
  return signal.aborted ? null : { catalogue, evaluation };
}
