// @vitest-environment jsdom
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseResourceDocument } from "@oaknational/resource-document/parse";
import { ResourceDocumentRenderer } from "./ResourceDocumentRenderer.js";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import {
  resourceVocabulary,
  type ResourceNode,
  type ResourceNodeType,
} from "@oaknational/resource-document";
import { describe, expect, it, vi } from "vitest";
import { ResourceNodeRenderer } from "./ResourceNodeRenderer.js";

const text = [{ type: "text", text: "Example" }] as const;
const examples = {
  section: {
    id: "section",
    type: "section",
    children: [{ id: "p", type: "paragraph", content: [...text] }],
  },
  heading: { id: "heading", type: "heading", level: 1, content: [...text] },
  paragraph: { id: "paragraph", type: "paragraph", content: [...text] },
  callout: { id: "callout", type: "callout", role: "instruction", content: [...text] },
  question: { id: "question", type: "question", children: [] },
  definitionList: {
    id: "definitions",
    type: "definitionList",
    entries: [{ term: [...text] }],
  },
  responseSpace: { id: "response", type: "responseSpace", kind: "box" },
  figure: { id: "figure", type: "figure", assetId: "asset", caption: [...text] },
  table: {
    id: "table",
    type: "table",
    role: "translation",
    header: [
      { kind: "content", content: [...text] },
      { kind: "content", content: [{ type: "text", text: "English" }] },
    ],
    rows: [
      [
        { kind: "content", content: [{ type: "text", text: "élève" }] },
        { kind: "answer" },
      ],
    ],
  },
  codeBlock: {
    id: "code",
    type: "codeBlock",
    language: "python",
    source: 'if ready:\n    print("élève")',
  },
  unsupported: {
    id: "unsupported",
    type: "unsupported",
    description: "Unknown source",
    original: { format: "test", value: "raw" },
  },
} satisfies { [K in ResourceNodeType]: Extract<ResourceNode, { type: K }> };

function renderNode(node: ResourceNode) {
  return render(
    <OakThemeProvider theme={oakDefaultTheme}>
      <ResourceNodeRenderer
        node={node}
        assets={[
          {
            id: "asset",
            mediaType: "image/svg+xml",
            contentRef: "/fixtures/balance-model.svg",
            alternative: { kind: "text", text: "Balance", origin: "authored" },
          },
        ]}
        parentHeadingLevel={2}
      />
    </OakThemeProvider>,
  );
}

describe("vocabulary renderer coverage", () => {
  it("has an example for every vocabulary entry", () => {
    expect(Object.keys(examples).sort()).toEqual(
      Object.keys(resourceVocabulary.nodes).sort(),
    );
  });
  it.each(Object.keys(resourceVocabulary.nodes) as ResourceNodeType[])(
    "renders %s",
    (type) => {
      const { container } = renderNode(examples[type]);
      expect(container.firstElementChild).not.toBeNull();
      if (type !== "unsupported")
        expect(
          screen.queryByText("Some worksheet content cannot be previewed yet."),
        ).toBeNull();
    },
  );
  it("gives a table real header cells and labels its answer blanks", () => {
    renderNode(examples.table);
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(
      ["Example", "English"],
    );
    expect(screen.getByRole("table")).toHaveAccessibleName("translation table");
    expect(
      screen.getByRole("cell", { name: "Answer space, row 1, column 2" }),
    ).toBeInTheDocument();
  });

  it("makes every answer blank reachable and names its position within the table", async () => {
    renderNode({
      ...examples.table,
      header: [
        { kind: "empty" },
        { kind: "content", content: [{ type: "text", text: "English" }] },
        { kind: "answer" },
      ],
      rows: [
        [
          { kind: "content", content: [{ type: "text", text: "élève" }] },
          { kind: "answer" },
          { kind: "answer" },
        ],
        [{ kind: "answer" }, { kind: "empty" }, { kind: "answer" }],
      ],
    });
    const table = screen.getByRole("table", { name: "translation table" });
    const headers = within(table).getAllByRole("columnheader");
    for (const header of headers) expect(header).toHaveAttribute("scope", "col");
    expect(headers[0]).toBeEmptyDOMElement();

    const blanks = [
      within(table).getByRole("columnheader", {
        name: "Answer space, header, column 3",
      }),
      ...[
        "row 1, column 2",
        "row 1, column 3",
        "row 2, column 1",
        "row 2, column 3",
      ].map((position) =>
        within(table).getByRole("cell", { name: `Answer space, ${position}` }),
      ),
    ];
    await userEvent.tab();
    expect(table.parentElement).toHaveFocus();
    for (const blank of blanks) {
      await userEvent.tab();
      expect(blank).toHaveFocus();
    }
    expect(within(table).getByRole("cell", { name: "" })).not.toHaveAttribute(
      "tabindex",
    );
  });

  it("renders repeated column headings without duplicate React keys", () => {
    const errors = vi.spyOn(console, "error");
    try {
      renderNode({
        ...examples.table,
        header: [
          { kind: "content", content: [...text] },
          { kind: "content", content: [...text] },
        ],
      });
      expect(screen.getAllByRole("columnheader", { name: "Example" })).toHaveLength(2);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
  it("names a table role of its own without repeating the word", () => {
    renderNode({ ...examples.table, role: "table" });
    expect(screen.getByRole("table")).toHaveAccessibleName("Table");
  });
  it.each([examples.table, examples.codeBlock])(
    "puts a tab stop on the scrollable region of a $type",
    async (node) => {
      renderNode(node);
      const region =
        node.type === "table"
          ? screen.getByRole("table").parentElement
          : screen.getByRole("group", { name: "python code" });
      await userEvent.tab();
      expect(region).toHaveFocus();
    },
  );
  it("renders code as one continuous text node in a labelled group", () => {
    const { container } = renderNode(examples.codeBlock);
    const code = container.querySelector("pre > code");
    expect(code?.textContent).toBe(examples.codeBlock.source);
    expect(code?.childNodes).toHaveLength(1);
    expect(screen.getByRole("group")).toHaveAccessibleName("python code");
  });
});

it("renders every committed fixture without unsupported or missing-figure notices", async () => {
  const directory = resolve("../original-resource-documents/fixtures");
  for (const id of await readdir(directory)) {
    const resource = parseResourceDocument(
      JSON.parse(await readFile(join(directory, id, "expected/document.json"), "utf8")),
    );
    const { container, unmount } = render(
      <OakThemeProvider theme={oakDefaultTheme}>
        <ResourceDocumentRenderer document={resource} />
      </OakThemeProvider>,
    );
    expect(container.textContent).not.toContain(
      "Some worksheet content cannot be previewed yet.",
    );
    expect(container.textContent).not.toContain("Figure unavailable in this preview.");
    unmount();
  }
});
