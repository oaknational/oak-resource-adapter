import { describe, expect, it } from "vitest";

import {
  lessonContextSchema,
  resourceAdapterCapabilitiesRequestSchema,
  resourceAdapterCapabilitiesResponseSchema,
  resourceAdapterContractVersion,
} from "./index.js";

describe("resourceAdapterContractVersion", () => {
  it("starts at version 1", () => {
    expect(resourceAdapterContractVersion).toBe(1);
  });

  it("accepts a representative lesson context", () => {
    expect(
      lessonContextSchema.parse({
        lessonSlug: "adding-fractions",
        programmeSlug: "ks2-maths",
        title: "Adding fractions",
        subjectSlug: "maths",
        keyStageSlug: "ks2",
        availableResources: ["worksheet"],
      }),
    ).toMatchObject({ title: "Adding fractions" });
  });

  it("accepts a capability response", () => {
    expect(
      resourceAdapterCapabilitiesResponseSchema.parse({
        capabilities: [
          {
            id: "worksheetAdapter",
            label: "Adapt worksheet",
            resourceType: "worksheet",
          },
        ],
      }),
    ).toMatchObject({
      capabilities: [{ id: "worksheetAdapter" }],
    });
  });

  it("accepts a capabilities request without teacher identity", () => {
    expect(
      resourceAdapterCapabilitiesRequestSchema.parse({
        contractVersion: resourceAdapterContractVersion,
        lesson: {
          lessonSlug: "adding-fractions",
          programmeSlug: "ks2-maths",
          title: "Adding fractions",
          subjectSlug: "maths",
          keyStageSlug: "ks2",
          availableResources: ["worksheet"],
        },
      }),
    ).toMatchObject({ lesson: { lessonSlug: "adding-fractions" } });
  });
});
