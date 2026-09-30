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
  const ks2 = { id: "ks2", label: "Key stage 2" };

  it("states the ages behind a key stage rather than implying them", () => {
    const part = languagePart({
      keyStage: ks2,
      yearGroup: { id: "year-6", label: "Year 6" },
    });

    expect(part).toContain("Year 6, Key stage 2, aged 7 to 11");
  });

  it("names the cohort it has when the key stage is unrecognised", () => {
    const part = languagePart({ keyStage: { id: "post-16", label: "Post-16" } });

    expect(part).toContain("Post-16");
    expect(part).not.toContain("aged");
  });

  it("says so when the resource does not name a year group", () => {
    expect(languagePart({})).toContain("does not say which year group");
  });

  it("uses a target reading age where the resource sets one", () => {
    expect(languagePart({ keyStage: ks2, targetReadingAge: 9 })).toContain(
      "reading age of 9",
    );
  });
});
