// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { describe, expect, it } from "vitest";
import type { ResourceDocument } from "@oaknational/resource-document";

import { ResourceDocumentRenderer } from "./ResourceDocumentRenderer.js";

function renderDocument(resource: ResourceDocument) {
  return render(
    <OakThemeProvider theme={oakDefaultTheme}>
      <ResourceDocumentRenderer document={resource} />
    </OakThemeProvider>,
  );
}

const document: ResourceDocument = {
  schemaVersion: "0.1",
  id: "renderer-test",
  profile: "worksheet.v0",
  language: "en-GB",
  metadata: { title: "Renderer test worksheet" },
  content: [
    {
      id: "heading",
      type: "heading",
      level: 1,
      content: [{ type: "text", text: "Practice" }],
    },
    {
      id: "section",
      type: "section",
      children: [
        {
          id: "instruction",
          type: "callout",
          role: "instruction",
          content: [{ type: "text", text: "Show your working." }],
        },
      ],
    },
    {
      id: "question",
      type: "question",
      label: "1",
      marks: 2,
      children: [
        {
          id: "question-text",
          type: "paragraph",
          content: [
            { type: "text", text: "Calculate " },
            { type: "math", value: "3 \\times \\square = 12", display: false },
          ],
        },
        {
          id: "response",
          type: "responseSpace",
          kind: "lines",
          lines: 4,
        },
      ],
    },
    {
      id: "definitions",
      type: "definitionList",
      lead: [{ type: "text", text: "Key words" }],
      entries: [
        {
          term: [{ type: "text", text: "multiple" }],
          definition: [{ type: "text", text: "A number in a times table." }],
        },
      ],
    },
    {
      id: "figure",
      type: "figure",
      assetId: "diagram",
      caption: [{ type: "text", text: "A useful diagram." }],
    },
    {
      id: "future",
      type: "unsupported",
      description: "A future interactive grid",
      accessibleText: "A three by three number grid.",
      original: { format: "oak-mmd", value: "future" },
    },
  ],
  answers: [],
  assets: [
    {
      id: "diagram",
      mediaType: "image/svg+xml",
      contentRef: "https://example.test/diagram.svg",
      alternative: {
        kind: "text",
        text: "Four counters arranged in a square.",
        origin: "source",
      },
    },
  ],
  provenance: {
    source: { system: "test", id: "renderer" },
    producer: { name: "test", version: "1" },
  },
  diagnostics: [
    {
      category: "unsupported-markup",
      severity: "warning",
      message: "Future content was preserved.",
      nodeId: "future",
      reviewRequired: true,
    },
  ],
};

describe("ResourceDocumentRenderer", () => {
  it("renders the canonical worksheet as semantic teacher-facing HTML", () => {
    renderDocument(document);

    const worksheet = screen.getByRole("article", {
      name: "Renderer test worksheet",
    });
    expect(worksheet).toHaveAttribute("lang", "en-GB");
    expect(
      within(worksheet).getByRole("heading", { level: 3, name: "Practice" }),
    ).toBeVisible();
    expect(within(worksheet).getByText("Instructions:")).toBeVisible();
    expect(within(worksheet).getByText("Show your working.")).toBeVisible();
    expect(
      within(worksheet).getByRole("heading", {
        level: 4,
        name: "Question 1 (2 marks)",
      }),
    ).toBeVisible();
    expect(within(worksheet).queryByRole("region")).not.toBeInTheDocument();
    expect(within(worksheet).getByRole("math")).toHaveTextContent("3 × □ = 12");
    expect(within(worksheet).getByLabelText("Answer space with 4 lines")).toBeVisible();
    expect(within(worksheet).getByText("multiple")).toBeVisible();
    expect(
      within(worksheet).getByRole("img", {
        name: "Four counters arranged in a square.",
      }),
    ).toBeVisible();
    expect(within(worksheet).getByText("A three by three number grid.")).toBeVisible();
    expect(
      within(worksheet).getByText(/1 part could not be read exactly/),
    ).toBeVisible();
  });

  it("renders question controls before the response space", () => {
    render(
      <OakThemeProvider theme={oakDefaultTheme}>
        <ResourceDocumentRenderer
          decorations={{
            renderAfterNode: (node) =>
              node.id === "question" ? <div>Suggested question controls</div> : null,
          }}
          document={document}
        />
      </OakThemeProvider>,
    );

    const controls = screen.getByText("Suggested question controls");
    const responseSpace = screen.getByLabelText("Answer space with 4 lines");

    expect(screen.getAllByText("Suggested question controls")).toHaveLength(1);
    expect(controls.compareDocumentPosition(responseSpace)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("renders worksheet tasks as independently collapsible heading regions", async () => {
    const taskDocument: ResourceDocument = {
      ...document,
      content: [
        document.content[0]!,
        {
          id: "task-a",
          type: "heading",
          level: 2,
          content: [{ type: "text", text: "Task A" }],
        },
        {
          id: "question-1",
          type: "question",
          label: "1",
          children: [],
        },
        {
          id: "question-2",
          type: "question",
          label: "2",
          children: [],
        },
        {
          id: "task-b",
          type: "heading",
          level: 2,
          content: [{ type: "text", text: "Task B" }],
        },
        {
          id: "question-3",
          type: "question",
          label: "3",
          children: [],
        },
      ],
      diagnostics: [],
    };
    const { rerender } = renderDocument(taskDocument);

    const worksheet = screen.getByRole("article", {
      name: "Renderer test worksheet",
    });
    expect(
      within(worksheet).getByRole("heading", { level: 3, name: "Practice" }),
    ).toBeVisible();
    const taskAToggle = within(worksheet).getByRole("button", { name: "Task A" });
    const taskARegion = within(worksheet).getByRole("region", { name: "Task A" });
    const taskBRegion = within(worksheet).getByRole("region", { name: "Task B" });

    expect(taskAToggle).toHaveAttribute("aria-expanded", "true");
    expect(taskAToggle).toHaveAttribute("aria-controls", taskARegion.id);
    expect(taskARegion).toBeVisible();
    expect(taskBRegion).toBeVisible();
    expect(
      within(worksheet).getByRole("heading", { level: 5, name: "Question 1" }),
    ).toBeVisible();
    expect(
      within(worksheet).getByRole("heading", { level: 5, name: "Question 2" }),
    ).toBeVisible();

    await userEvent.click(taskAToggle);

    expect(taskAToggle).toHaveAttribute("aria-expanded", "false");
    expect(taskARegion).not.toBeVisible();
    expect(taskBRegion).toBeVisible();

    rerender(
      <OakThemeProvider theme={oakDefaultTheme}>
        <ResourceDocumentRenderer
          document={{
            ...taskDocument,
            metadata: { title: "Updated renderer test worksheet" },
          }}
        />
      </OakThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Task A" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    taskAToggle.focus();
    await userEvent.keyboard("{Enter}");

    expect(taskAToggle).toHaveAttribute("aria-expanded", "true");
    expect(taskARegion).toBeVisible();
  });

  it("speaks maths markup it cannot render as symbols", () => {
    renderDocument({
      ...document,
      content: [
        {
          id: "display",
          type: "paragraph",
          content: [
            { type: "math", value: "\\frac{3}{4} \\times x^{2}", display: true },
          ],
        },
      ],
      diagnostics: [],
    });

    const expression = screen.getByRole("math");
    expect(expression).toHaveAccessibleName(
      "Mathematical expression: 3 over 4 × x squared",
    );
    expect(expression).toHaveAttribute("tabindex", "0");
  });

  it("labels a contribution once, at the node that starts it", () => {
    renderDocument({
      ...document,
      content: [
        {
          id: "added-section",
          type: "section",
          extensions: { "oak:contribution": "contribution-1" },
          children: [
            {
              id: "added-guidance",
              type: "paragraph",
              extensions: { "oak:contribution": "contribution-1" },
              content: [{ type: "text", text: "Try one step at a time." }],
            },
          ],
        },
      ],
      diagnostics: [],
    });

    expect(screen.getAllByText("Added support")).toHaveLength(1);
    expect(screen.getByText("Try one step at a time.")).toBeVisible();
  });

  it("places contribution controls inside the label they belong to", () => {
    render(
      <OakThemeProvider theme={oakDefaultTheme}>
        <ResourceDocumentRenderer
          decorations={{
            renderContributionControls: (contributionId) => (
              <button type="button">{`Remove ${contributionId}`}</button>
            ),
          }}
          document={{
            ...document,
            content: [
              {
                content: [{ type: "text", text: "Try one step at a time." }],
                extensions: { "oak:contribution": "contribution-1" },
                id: "added-guidance",
                type: "paragraph",
              },
            ],
            diagnostics: [],
          }}
        />
      </OakThemeProvider>,
    );

    const label = screen.getByText("Added support");
    const control = screen.getByRole("button", { name: "Remove contribution-1" });
    expect(label.parentElement).toContainElement(control);
  });

  it("shows a readable fallback when a figure asset is missing", () => {
    renderDocument({ ...document, assets: [] });

    expect(screen.getByText(/Figure unavailable in this preview/)).toHaveTextContent(
      "Caption: A useful diagram.",
    );
  });
});
