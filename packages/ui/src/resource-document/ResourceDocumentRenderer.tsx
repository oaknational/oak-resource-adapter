import { Fragment, type ReactNode, useId, useState } from "react";
import type { ResourceDocument, ResourceNode } from "@oaknational/resource-document";
import { OakIcon, parseColor, parseDropShadow } from "@oaknational/oak-components";
import { styled } from "styled-components";

import { InlineContentRenderer } from "./InlineContentRenderer.js";
import { ResourceNodeListRenderer } from "./ResourceNodeRenderer.js";

const Document = styled.article`
  background: ${parseColor("bg-primary")};
  border: 1px solid ${parseColor("border-neutral-lighter")};
  border-radius: 0.5rem;
  color: ${parseColor("text-primary")};
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: clamp(1rem, 4vw, 2rem);

  h3,
  h4,
  h5,
  h6 {
    line-height: 1.2;
    margin: 0.5rem 0 0;
  }
`;

const DiagnosticSummary = styled.aside`
  background: ${parseColor("lemon30")};
  border: 1px solid ${parseColor("border-neutral-stronger")};
  border-radius: 0.5rem;
  color: ${parseColor("text-primary")};
  padding: 0.75rem;
`;

const TaskGroup = styled.section`
  border: 1px solid ${parseColor("border-neutral-lighter")};
  border-radius: 0.5rem;
  overflow: hidden;
`;

const TaskHeading = styled.h4`
  && {
    margin: 0;
  }
`;

const TaskToggle = styled.button`
  align-items: center;
  background: ${parseColor("bg-neutral")};
  border: 0;
  color: ${parseColor("text-primary")};
  cursor: pointer;
  display: flex;
  font: inherit;
  font-weight: 700;
  gap: 1rem;
  justify-content: space-between;
  min-height: 3rem;
  padding: 1rem;
  scroll-margin-top: 7rem;
  text-align: left;
  width: 100%;

  &:focus-visible {
    box-shadow:
      ${parseDropShadow("drop-shadow-centered-lemon")},
      ${parseDropShadow("drop-shadow-centered-grey")};
    outline: none;
  }
`;

const TaskChevron = styled(OakIcon)<{ $isOpen: boolean }>`
  flex: 0 0 auto;
  transform: rotate(${({ $isOpen }) => ($isOpen ? "180deg" : "0deg")});
  transition: transform 0.2s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const TaskContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;

  /* Out-specifies the UA sheet, which this display declaration would beat. */
  &[hidden] {
    display: none;
  }
`;

type HeadingNode = Extract<ResourceNode, { type: "heading" }>;

type DocumentPart =
  | Readonly<{ kind: "nodes"; nodes: readonly ResourceNode[] }>
  | Readonly<{
      children: readonly ResourceNode[];
      heading: HeadingNode;
      kind: "task";
    }>;

/**
 * The extractor mints one `task-` prefixed level 2 heading per worksheet task;
 * see the worksheet extraction schema in `@oaknational/resource-document`.
 */
function isTaskHeading(node: ResourceNode): node is HeadingNode {
  return node.type === "heading" && node.level === 2 && node.id.startsWith("task-");
}

function documentParts(nodes: readonly ResourceNode[]): readonly DocumentPart[] {
  const parts: DocumentPart[] = [];
  let task:
    { children: ResourceNode[]; heading: HeadingNode; kind: "task" } | undefined;
  let ungrouped: ResourceNode[] = [];

  const flushUngrouped = () => {
    if (ungrouped.length > 0) {
      parts.push({ kind: "nodes", nodes: ungrouped });
      ungrouped = [];
    }
  };

  for (const node of nodes) {
    if (node.type === "heading" && node.level === 2) {
      task = undefined;
      if (isTaskHeading(node)) {
        flushUngrouped();
        task = { children: [], heading: node, kind: "task" };
        parts.push(task);
      } else {
        ungrouped.push(node);
      }
      continue;
    }

    if (task === undefined) {
      ungrouped.push(node);
    } else {
      task.children.push(node);
    }
  }

  flushUngrouped();

  return parts;
}

function TaskAccordion({
  assets,
  heading,
  nodes,
  renderAfterNode,
}: Readonly<{
  assets: ResourceDocument["assets"];
  heading: HeadingNode;
  nodes: readonly ResourceNode[];
  renderAfterNode?: (node: ResourceNode) => ReactNode;
}>) {
  const [isOpen, setIsOpen] = useState(true);
  const id = useId();
  const toggleId = `${id}-task-toggle`;
  const panelId = `${id}-task-panel`;

  return (
    <TaskGroup>
      <TaskHeading>
        <TaskToggle
          aria-controls={panelId}
          aria-expanded={isOpen}
          id={toggleId}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <InlineContentRenderer content={heading.content} />
          <TaskChevron
            $height="spacing-24"
            $isOpen={isOpen}
            $width="spacing-24"
            alt=""
            aria-hidden="true"
            iconName="chevron-down"
          />
        </TaskToggle>
      </TaskHeading>
      <TaskContent
        aria-labelledby={toggleId}
        hidden={!isOpen}
        id={panelId}
        role="region"
      >
        {renderAfterNode?.(heading)}
        <ResourceNodeListRenderer
          assets={assets}
          nodes={nodes}
          parentHeadingLevel={4}
          {...(renderAfterNode === undefined ? {} : { renderAfterNode })}
        />
      </TaskContent>
    </TaskGroup>
  );
}

function DocumentContent({
  assets,
  nodes,
  renderAfterNode,
}: Readonly<{
  assets: ResourceDocument["assets"];
  nodes: readonly ResourceNode[];
  renderAfterNode?: (node: ResourceNode) => ReactNode;
}>) {
  return documentParts(nodes).map((part) => {
    if (part.kind === "task") {
      return (
        <TaskAccordion
          assets={assets}
          heading={part.heading}
          key={part.heading.id}
          nodes={part.children}
          {...(renderAfterNode === undefined ? {} : { renderAfterNode })}
        />
      );
    }

    return (
      <Fragment key={part.nodes[0]?.id}>
        <ResourceNodeListRenderer
          assets={assets}
          nodes={part.nodes}
          parentHeadingLevel={2}
          {...(renderAfterNode === undefined ? {} : { renderAfterNode })}
        />
      </Fragment>
    );
  });
}

export function ResourceDocumentRenderer({
  document,
  renderAfterNode,
}: Readonly<{
  document: ResourceDocument;
  renderAfterNode?: (node: ResourceNode) => ReactNode;
}>) {
  const title = document.metadata.title ?? "Untitled resource";
  const { length: diagnosticCount } = document.diagnostics;

  return (
    <Document aria-label={title} lang={document.language}>
      {diagnosticCount > 0 && (
        <DiagnosticSummary role="note">
          Check this preview against the original worksheet: {diagnosticCount}{" "}
          {diagnosticCount === 1 ? "part" : "parts"} could not be read exactly.
        </DiagnosticSummary>
      )}
      <DocumentContent
        assets={document.assets}
        nodes={document.content}
        {...(renderAfterNode === undefined ? {} : { renderAfterNode })}
      />
    </Document>
  );
}
