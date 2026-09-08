import { describe, expect, it } from "vitest";

import { worksheetScaffoldingPollDelay } from "./useWorksheetScaffolding.js";

describe("worksheet scaffolding polling", () => {
  it("starts promptly, backs off exponentially, and caps the delay", () => {
    expect(
      Array.from({ length: 7 }, (_, attempt) => worksheetScaffoldingPollDelay(attempt)),
    ).toEqual([100, 200, 400, 750, 750, 750, 750]);
  });
});
