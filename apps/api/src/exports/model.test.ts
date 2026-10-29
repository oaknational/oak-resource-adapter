import type { ResourceNode } from "@oaknational/resource-document";
import { describe, expect, it } from "vitest";

import { keptWithFollowingContent } from "./model";

type Layout = NonNullable<ResourceNode["layout"]>;

function text(id: string, layout?: Layout): ResourceNode {
  return {
    id,
    type: "paragraph",
    content: [{ type: "text", text: id }],
    ...(layout ? { layout } : {}),
  };
}

function section(id: string, children: ResourceNode[], layout?: Layout): ResourceNode {
  return { id, type: "section", children, ...(layout ? { layout } : {}) };
}

function space(
  id: string,
  kind: "box" | "lines" = "box",
  layout?: Layout,
): ResourceNode {
  return {
    id,
    type: "responseSpace",
    kind,
    ...(kind === "lines" ? { lines: 4 } : {}),
    ...(layout ? { layout } : {}),
  };
}

function table(id: string): ResourceNode {
  return {
    id,
    type: "table",
    role: "example",
    rows: [[{ kind: "content", content: [{ type: "text", text: id }] }]],
  };
}

const figure: ResourceNode = { id: "figure", type: "figure", assetId: "image" };

const wordBank: ResourceNode = {
  id: "bank",
  type: "definitionList",
  entries: [{ term: [{ type: "text", text: "ion" }] }],
};

const steps = (layouts: Record<string, Layout> = {}, ids = ["s1", "s2"]) =>
  section(
    "steps",
    ids.map((id) => text(id, layouts[id])),
  );

describe("keptWithFollowingContent", () => {
  it.each([
    {
      label: "a scaffold section before a box",
      children: [text("prompt"), steps({}, ["s1", "s2", "s3"]), space("box")],
      kept: ["prompt", "s1", "s2", "s3"],
    },
    {
      label: "nested sections before lines",
      children: [
        text("prompt"),
        section("starters", [text("lead"), section("lines", [text("l1"), text("l2")])]),
        space("lines", "lines"),
      ],
      kept: ["prompt", "lead", "l1", "l2"],
    },
    {
      label: "a word bank before lines",
      children: [text("prompt"), wordBank, space("lines", "lines")],
      kept: ["prompt", "bank"],
    },
    {
      label: "stacked scaffolds before a box",
      children: [
        text("prompt"),
        section("starters", [text("lead"), text("l1")]),
        wordBank,
        space("box"),
      ],
      kept: ["prompt", "lead", "l1", "bank"],
    },
    {
      label: "a multi-part question",
      children: [
        text("prompt-a"),
        space("lines-a", "lines"),
        text("prompt-b"),
        space("lines-b", "lines"),
      ],
      kept: ["prompt-a", "prompt-b"],
    },
    {
      label: "consecutive tables",
      children: [text("prompt"), table("t1"), table("t2")],
      kept: ["prompt", "t1"],
    },
    {
      label: "a multi-paragraph stem before a table",
      children: [text("p1"), text("p2"), table("t1")],
      kept: ["p1", "p2"],
    },
    {
      label: "a figure before a scaffold",
      children: [text("prompt"), figure, steps(), space("box")],
      kept: ["prompt", "figure", "s1", "s2"],
    },
    {
      label: "text only",
      children: [text("p1"), text("p2")],
      kept: [],
    },
    {
      label: "a scaffold appended after a table",
      children: [text("prompt"), table("t1"), steps()],
      kept: ["prompt"],
    },
    {
      label: "a break before the scaffold",
      children: [
        text("prompt"),
        section("steps", [text("s1"), text("s2")], { breakBefore: "page" }),
        space("box"),
      ],
      kept: ["s1", "s2"],
    },
    {
      label: "a break after the scaffold",
      children: [
        text("prompt"),
        section("steps", [text("s1"), text("s2")], { breakAfter: "page" }),
        space("box"),
      ],
      kept: [],
    },
    {
      label: "an empty section breaking before the answer",
      children: [
        text("prompt"),
        steps(),
        section("empty", [], { breakAfter: "page" }),
        space("box"),
      ],
      kept: [],
    },
    {
      label: "a break before the answer",
      children: [text("prompt"), steps(), space("box", "box", { breakBefore: "page" })],
      kept: [],
    },
    {
      label: "a break after the first step",
      children: [
        text("prompt"),
        steps({ s1: { breakAfter: "page" } }, ["s1", "s2", "s3"]),
        space("box"),
      ],
      kept: ["s2", "s3"],
    },
    {
      label: "an explicit opt-out on a step",
      children: [
        text("prompt"),
        steps({ s2: { keepWithNext: false } }, ["s1", "s2", "s3"]),
        space("box"),
      ],
      kept: ["prompt", "s1", "s2", "s3"],
    },
  ])("keeps $kept for $label", ({ children, kept }) => {
    const ids = [
      ...keptWithFollowingContent({ id: "question", type: "question", children }),
    ].map(({ id }) => id);

    expect(ids.toSorted()).toEqual(kept.toSorted());
  });
});
