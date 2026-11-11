import type {
  RuleCatalogue,
  RuleDescription,
} from "@oaknational/resource-adapter-dev-api-contracts";
import { describe, expect, it, vi } from "vitest";

import { describeEligibility, loadEligibility } from "./eligibility";

const rule = (overrides: Partial<RuleDescription> = {}): RuleDescription => ({
  condition: "A condition",
  config: {},
  description: "A rule under test.",
  id: "test",
  kind: "test",
  label: "Test",
  reads: ["lesson"],
  ...overrides,
});

describe("describeEligibility", () => {
  const catalogue: RuleCatalogue = {
    access: [],
    capabilities: [
      {
        id: "worksheetScaffolding",
        label: "Add extra scaffolding",
        rules: [
          rule({
            id: "resource-inputs",
            condition:
              "We don't have the lesson's worksheet, or haven't extracted it yet",
          }),
        ],
      },
    ],
    gates: [],
    lesson: [
      rule({
        id: "copyright",
        condition: "The lesson contains restricted copyright material",
      }),
    ],
    lessonMaterials: [],
    transformations: [],
  };

  it("quotes the condition of the lesson rule that refused, linked to it", () => {
    expect(
      describeEligibility(
        {
          capabilities: [],
          lesson: { level: "lesson", reason: "copyright-conflict", rule: "copyright" },
        },
        catalogue,
      ),
    ).toEqual([
      {
        offered: false,
        refusedBy: {
          anchor: "rule-lesson-copyright",
          reason: "Copyright conflict",
          condition: "The lesson contains restricted copyright material",
        },
        subject: "ORA",
      },
    ]);
  });

  it("gives each capability its own line otherwise", () => {
    expect(
      describeEligibility(
        {
          capabilities: [
            {
              id: "worksheetScaffolding",
              refusal: {
                level: "capability",
                reason: "not-extracted",
                rule: "resource-inputs",
              },
            },
          ],
          lesson: null,
        },
        catalogue,
      ),
    ).toEqual([
      {
        offered: false,
        refusedBy: {
          anchor: "rule-capability-worksheetScaffolding-resource-inputs",
          reason: "Not extracted",
          condition:
            "We don't have the lesson's worksheet, or haven't extracted it yet",
        },
        subject: "Add extra scaffolding",
      },
    ]);
  });
});

describe("loadEligibility", () => {
  const catalogue: RuleCatalogue = {
    access: [],
    capabilities: [],
    gates: [],
    lesson: [],
    lessonMaterials: [],
    transformations: [],
  };
  const lesson = {
    availableResources: ["worksheet" as const],
    keyStageSlug: "ks3",
    lessonSlug: "latitude-and-longitude",
    programmeSlug: "geography-secondary-ks3",
    subjectSlug: "geography",
    title: "Latitude and longitude",
  };
  const refused = {
    capabilities: [],
    lesson: { level: "lesson" as const, reason: "excluded-subject", rule: "subject" },
  };

  it("drops a response that arrives after the lesson changed", async () => {
    let releaseCatalogue: (value: RuleCatalogue) => void = () => undefined;
    const fetchers = {
      catalogue: vi.fn(
        () =>
          new Promise<RuleCatalogue>((resolve) => {
            releaseCatalogue = resolve;
          }),
      ),
      eligibility: vi.fn(() => Promise.resolve(refused)),
    };
    const controller = new AbortController();

    const loading = loadEligibility({ lesson }, controller.signal, fetchers);
    controller.abort();
    releaseCatalogue(catalogue);

    await expect(loading).resolves.toBeNull();
    expect(fetchers.catalogue).toHaveBeenCalledWith(controller.signal);
  });

  it("returns the decision while the request is still current", async () => {
    const fetchers = {
      catalogue: vi.fn(() => Promise.resolve(catalogue)),
      eligibility: vi.fn(() => Promise.resolve(refused)),
    };

    await expect(
      loadEligibility({ lesson }, new AbortController().signal, fetchers),
    ).resolves.toEqual({ catalogue, evaluation: refused });
  });
});
