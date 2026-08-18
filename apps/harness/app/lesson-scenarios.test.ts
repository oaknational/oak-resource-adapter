import { describe, expect, it } from "vitest";

import { lessonScenarioNavigation, loadLessonScenario } from "./lesson-scenarios";

describe("lesson scenarios", () => {
  it.each(lessonScenarioNavigation)(
    "loads $id from a parsed original resource document",
    async ({ id }) => {
      const scenario = await loadLessonScenario(id);

      expect(scenario).toMatchObject({
        id,
        extractedResourceTypes: ["worksheet"],
        lesson: { title: expect.any(String) },
        documentSummary: { schemaVersion: "0.1" },
      });
      expect(scenario.lesson.availableResources).toContain("worksheet");
      expect(scenario.documentSummary.contentNodeCount).toBeGreaterThan(0);
      expect(scenario.documentSummary.questionCount).toBeGreaterThan(0);
      expect(scenario.markup).toContain('profile: "worksheet.v0"');
      expect(scenario.rightsCheckedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
  );

  it("rejects a scenario outside the fixture catalogue", async () => {
    await expect(loadLessonScenario("not-a-scenario")).rejects.toThrow(
      'Unknown lesson scenario "not-a-scenario".',
    );
  });
});
