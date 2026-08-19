import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import type { ResourceDocument } from "@oaknational/resource-document";

import {
  all,
  always,
  disabled,
  notAlreadyApplied,
  notAlreadyAppliedToTarget,
  requiresNodeType,
} from "./availability";

import type { TransformationAvailabilityContext } from "./types";

let worksheet: ResourceDocument;

function contextFor(
  appliedKinds: readonly string[] = [],
): TransformationAvailabilityContext {
  return {
    appliedTransformations: appliedKinds.map((kind) => ({ kind, params: {} })),
    capabilityId: "worksheetAdapter",
    document: worksheet,
  };
}

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
  });
});

describe("always", () => {
  it("offers the kind whatever the context", () => {
    expect(always(contextFor(["identity"]))).toBe(true);
  });
});

describe("disabled", () => {
  it("withholds the kind whatever the context", () => {
    expect(disabled(contextFor())).toBe(false);
  });
});

describe("all", () => {
  it("requires every rule to hold", () => {
    expect(all(always, always)(contextFor())).toBe(true);
    expect(all(always, () => false)(contextFor())).toBe(false);
  });

  it("offers the kind when given no rules", () => {
    expect(all()(contextFor())).toBe(true);
  });
});

describe("notAlreadyApplied", () => {
  it("withdraws a kind the adaptation has already applied", () => {
    expect(notAlreadyApplied("identity")(contextFor(["identity"]))).toBe(false);
  });

  it("ignores other applied kinds", () => {
    expect(notAlreadyApplied("identity")(contextFor(["scaffold-add-word-bank"]))).toBe(
      true,
    );
  });
});

describe("notAlreadyAppliedToTarget", () => {
  it("allows the same kind on another node", () => {
    const context = {
      ...contextFor(),
      appliedTransformations: [
        { kind: "scaffold-add-word-bank", params: {}, targetBlockId: "question-1" },
      ],
      targetBlockId: "question-2",
    };

    expect(notAlreadyAppliedToTarget("scaffold-add-word-bank")(context)).toBe(true);
  });

  it("withdraws the same kind for the same node", () => {
    const context = {
      ...contextFor(),
      appliedTransformations: [
        { kind: "scaffold-add-word-bank", params: {}, targetBlockId: "question-1" },
      ],
      targetBlockId: "question-1",
    };

    expect(notAlreadyAppliedToTarget("scaffold-add-word-bank")(context)).toBe(false);
  });
});

describe("requiresNodeType", () => {
  it("offers the kind when the document contains the node type", () => {
    expect(requiresNodeType("question")(contextFor())).toBe(true);
  });

  it("withdraws the kind when the document contains no such node", () => {
    const empty = {
      ...contextFor(),
      document: { ...worksheet, answers: [], content: [] },
    };

    expect(requiresNodeType("question")(empty)).toBe(false);
  });
});
