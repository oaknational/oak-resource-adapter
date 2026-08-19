import { describe, expect, it } from "vitest";

import { identityPart } from "./identity.part";
import { languagePart } from "./language.part";
import { scaffoldPrinciplesPart } from "./scaffold-principles.part";

describe("identityPart", () => {
  it("holds the agent to one change", () => {
    expect(identityPart()).toContain("one change");
  });
});

describe("scaffoldPrinciplesPart", () => {
  it("states what a scaffold must not do", () => {
    expect(scaffoldPrinciplesPart()).toContain("Do not:");
  });
});

describe("languagePart", () => {
  it("states the ages behind a key stage rather than implying them", () => {
    const part = languagePart({ keyStage: "KS2", yearGroup: "Year 6" });

    expect(part).toContain("Year 6, KS2");
    expect(part).toContain("aged 7 to 11");
  });

  it("names the cohort it has when the key stage is unrecognised", () => {
    const part = languagePart({ keyStage: "Key stage 2" });

    expect(part).toContain("Key stage 2");
    expect(part).not.toContain("aged");
  });

  it("says so when the resource does not name a year group", () => {
    expect(languagePart({})).toContain("does not say which year group");
  });

  it("uses a target reading age where the resource sets one", () => {
    expect(languagePart({ keyStage: "ks3", targetReadingAge: 9 })).toContain(
      "reading age of 9",
    );
  });
});
