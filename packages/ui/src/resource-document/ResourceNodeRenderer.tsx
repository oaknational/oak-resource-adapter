import { Fragment, type ReactNode } from "react";
import {
  resourceVocabulary,
  contributionIdOf,
  type Asset,
  type InlineContent,
  type ResourceNode,
  type TableCell,
  type UnsupportedNode,
} from "@oaknational/resource-document";
import { parseColor } from "@oaknational/oak-components";
import { styled } from "styled-components";

import { InlineContentRenderer } from "./InlineContentRenderer.js";

const ContentSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const AppliedTransformation = styled.div`
  background: ${parseColor("bg-primary")};
  border: 1px solid ${parseColor("border-neutral-lighter")};
  border-left: 0.25rem solid ${parseColor("border-decorative2")};
  border-radius: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding: 1.5rem 1rem 1rem;
  position: relative;
`;

const AppliedTransformationLabel = styled.span`
  background: ${parseColor("bg-decorative2-very-subdued")};
  border: 1px solid ${parseColor("border-decorative2")};
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  left: 0.75rem;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  position: absolute;
  top: 0;
  transform: translateY(-50%);
`;

const Paragraph = styled.p`
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
`;

const Callout = styled.aside`
  background: ${parseColor("bg-neutral")};
  border-left: 0.375rem solid ${parseColor("border-primary")};
  border-radius: 0.25rem;
  padding: 1rem;
`;

const Question = styled.div`
  border-top: 1px solid ${parseColor("border-neutral-lighter")};
  padding-top: 1rem;
`;

const QuestionContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
`;

const ResponseSpace = styled.div<{ $kind: "box" | "grid" | "lines"; $lines: number }>`
  background-image: ${({ $kind, theme }) => {
    const line = parseColor("border-neutral")({ theme });

    if ($kind === "grid") {
      return `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`;
    }

    if ($kind === "lines") {
      return `repeating-linear-gradient(to bottom, transparent 0, transparent 1.75rem, ${line} 1.75rem, ${line} calc(1.75rem + 1px))`;
    }

    return "none";
  }};
  background-size: ${({ $kind }) => ($kind === "grid" ? "1.5rem 1.5rem" : "auto")};
  border: ${({ $kind, theme }) =>
    $kind === "box" ? `1px solid ${parseColor("border-neutral")({ theme })}` : "0"};
  min-height: ${({ $lines }) => Math.max(4, $lines * 1.75)}rem;
  width: 100%;
`;

const DefinitionList = styled.dl`
  display: grid;
  gap: 0.75rem;
  margin: 0;

  dt {
    font-weight: 700;
  }

  dd {
    margin: 0.25rem 0 0;
  }
`;

const Unsupported = styled.aside`
  background: ${parseColor("lemon30")};
  border: 2px solid ${parseColor("border-neutral-stronger")};
  border-radius: 0.5rem;
  color: ${parseColor("text-primary")};
  padding: 1rem;
`;

const MissingFigure = styled(Unsupported)`
  margin: 0;
`;

const Figure = styled.figure`
  margin: 0;

  img {
    height: auto;
    max-width: 100%;
  }

  figcaption {
    margin-top: 0.5rem;
  }
`;

const Table = styled.table`
  border-collapse: collapse;
  width: 100%;

  th,
  td {
    border: 1px solid ${parseColor("border-neutral")};
    min-width: 2rem;
    padding: 0.5rem;
  }

  th {
    text-align: left;
  }

  th:focus-visible,
  td:focus-visible {
    outline: 3px solid ${parseColor("border-primary")};
    outline-offset: -3px;
  }
`;

const ScrollableRegion = styled.div`
  max-width: 100%;
  overflow-x: auto;

  &:focus-visible {
    outline: 3px solid ${parseColor("border-primary")};
    outline-offset: 2px;
  }
`;

const CodeBlock = styled(ScrollableRegion).attrs({ as: "pre" })`
  margin: 0;
`;

const HiddenLabel = styled.span`
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
`;

const AnswerCell = styled.div`
  min-height: 1.5rem;
`;

const CalloutLabels = {
  "learning-objective": "Learning objective",
  instruction: "Instructions",
  note: "Note",
  warning: "Warning",
} as const;

type ContentHeadingLevel = 3 | 4 | 5 | 6;
type ParentHeadingLevel = 2 | ContentHeadingLevel;

function assertNever(value: never): never {
  throw new Error(`Unsupported resource node type: ${JSON.stringify(value)}`);
}

function inlineText(content: InlineContent): string {
  return content.map((run) => (run.type === "text" ? run.text : run.value)).join("");
}

function tableLabel(role: string): string {
  const words = role.replaceAll("-", " ");
  return words === "table" ? "Table" : `${words} table`;
}

function codeBlockLabel(language: string | undefined): string {
  return language === undefined ? "Code" : `${language} code`;
}

function pluralisedMarks(marks: number): string {
  return `${marks} ${marks === 1 ? "mark" : "marks"}`;
}

function contentText(node: UnsupportedNode): string {
  return node.accessibleText ?? node.description;
}

function headingLevel(level: number): ContentHeadingLevel {
  switch (Math.min(level + 2, 6)) {
    case 3:
      return 3;
    case 4:
      return 4;
    case 5:
      return 5;
    default:
      return 6;
  }
}

function nestedHeadingLevel(level: ParentHeadingLevel): ContentHeadingLevel {
  return Math.min(level + 1, 6) as ContentHeadingLevel;
}

function Heading({
  children,
  level,
}: Readonly<{ children: ReactNode; level: ContentHeadingLevel }>) {
  switch (level) {
    case 3:
      return <h3>{children}</h3>;
    case 4:
      return <h4>{children}</h4>;
    case 5:
      return <h5>{children}</h5>;
    default:
      return <h6>{children}</h6>;
  }
}

/** Slots a capability fills in while the teacher works on the document. */
export type ResourceDocumentDecorations = Readonly<{
  /** Placed after a node, or inside a question above its response space. */
  renderAfterNode?: ((node: ResourceNode) => ReactNode) | undefined;
  /** Placed inside the frame marking content one contribution added. */
  renderContributionControls?: ((contributionId: string) => ReactNode) | undefined;
}>;

/**
 * A question places its own trailing slot above its response space, so the list
 * must not place it a second time after the whole question.
 */
function placesOwnTrailingSlot(node: ResourceNode): boolean {
  return node.type === "question";
}

export function ResourceNodeListRenderer({
  assets,
  decorations,
  nodes,
  parentContributionId,
  parentHeadingLevel,
  renderBeforeNode,
}: Readonly<{
  assets: readonly Asset[];
  decorations?: ResourceDocumentDecorations | undefined;
  nodes: readonly ResourceNode[];
  parentContributionId?: string | undefined;
  parentHeadingLevel: ParentHeadingLevel;
  renderBeforeNode?: ((node: ResourceNode) => ReactNode) | undefined;
}>) {
  let currentHeadingLevel = parentHeadingLevel;

  return nodes.map((node) => {
    const nodeParentHeadingLevel = currentHeadingLevel;
    const nodeContributionId = contributionIdOf(node.extensions);

    if (node.type === "heading") {
      currentHeadingLevel = headingLevel(node.level);
    }

    const renderedNode = (
      <ResourceNodeRenderer
        assets={assets}
        decorations={decorations}
        node={node}
        parentHeadingLevel={nodeParentHeadingLevel}
      />
    );
    const startsContribution =
      nodeContributionId !== undefined && nodeContributionId !== parentContributionId;

    return (
      <Fragment key={node.id}>
        {renderBeforeNode?.(node)}
        {startsContribution ? (
          <AppliedTransformation>
            <AppliedTransformationLabel>Added support</AppliedTransformationLabel>
            {renderedNode}
            {decorations?.renderContributionControls?.(nodeContributionId)}
          </AppliedTransformation>
        ) : (
          renderedNode
        )}
        {placesOwnTrailingSlot(node) ? null : decorations?.renderAfterNode?.(node)}
      </Fragment>
    );
  });
}

function FigureNode({
  assets,
  node,
}: Readonly<{
  assets: readonly Asset[];
  node: Extract<ResourceNode, { type: "figure" }>;
}>) {
  const asset = assets.find((candidate) => candidate.id === node.assetId);

  if (!asset || asset.alternative.kind === "missing") {
    return (
      <MissingFigure role="note">
        Figure unavailable in this preview.
        {node.caption && (
          <>
            {" "}
            Caption: <InlineContentRenderer content={node.caption} />
          </>
        )}
      </MissingFigure>
    );
  }

  const alt = asset.alternative.kind === "decorative" ? "" : asset.alternative.text;

  return (
    <Figure>
      <img alt={alt} src={asset.contentRef} />
      {node.caption && (
        <figcaption>
          <InlineContentRenderer content={node.caption} />
        </figcaption>
      )}
    </Figure>
  );
}

export function ResourceNodeRenderer({
  assets,
  decorations,
  node,
  parentHeadingLevel,
}: Readonly<{
  assets: readonly Asset[];
  decorations?: ResourceDocumentDecorations | undefined;
  node: ResourceNode;
  parentHeadingLevel: ParentHeadingLevel;
}>) {
  switch (node.type) {
    case resourceVocabulary.nodes.section.nodeType:
      return (
        <ContentSection>
          <ResourceNodeListRenderer
            assets={assets}
            decorations={decorations}
            nodes={node.children}
            parentContributionId={contributionIdOf(node.extensions)}
            parentHeadingLevel={parentHeadingLevel}
          />
        </ContentSection>
      );
    case resourceVocabulary.nodes.heading.nodeType:
      return (
        <Heading level={headingLevel(node.level)}>
          <InlineContentRenderer content={node.content} />
        </Heading>
      );
    case resourceVocabulary.nodes.paragraph.nodeType:
      return (
        <Paragraph>
          <InlineContentRenderer content={node.content} />
        </Paragraph>
      );
    case resourceVocabulary.nodes.callout.nodeType:
      return (
        <Callout>
          <strong>{CalloutLabels[node.role]}: </strong>
          <InlineContentRenderer content={node.content} />
        </Callout>
      );
    case resourceVocabulary.nodes.question.nodeType: {
      const label = node.label ? `Question ${node.label}` : "Question";
      const questionHeadingLevel = nestedHeadingLevel(parentHeadingLevel);
      const marks = node.marks === undefined ? "" : ` (${pluralisedMarks(node.marks)})`;
      const responseSpace = node.children.find(
        (child) => child.type === "responseSpace",
      );
      const trailingSlot = decorations?.renderAfterNode?.(node);
      return (
        <Question>
          <Heading level={questionHeadingLevel}>{`${label}${marks}`}</Heading>
          <QuestionContent>
            <ResourceNodeListRenderer
              assets={assets}
              decorations={decorations}
              nodes={node.children}
              parentContributionId={contributionIdOf(node.extensions)}
              parentHeadingLevel={questionHeadingLevel}
              renderBeforeNode={(child) =>
                child.id === responseSpace?.id ? trailingSlot : null
              }
            />
            {responseSpace === undefined ? trailingSlot : null}
          </QuestionContent>
        </Question>
      );
    }
    case resourceVocabulary.nodes.definitionList.nodeType:
      return (
        <div>
          {node.lead && (
            <Paragraph>
              <InlineContentRenderer content={node.lead} />
            </Paragraph>
          )}
          <DefinitionList>
            {node.entries.map((entry) => (
              <div key={inlineText(entry.term)}>
                <dt>
                  <InlineContentRenderer content={entry.term} />
                </dt>
                {entry.definition && (
                  <dd>
                    <InlineContentRenderer content={entry.definition} />
                  </dd>
                )}
                {entry.example && (
                  <dd>
                    Example: <InlineContentRenderer content={entry.example} />
                  </dd>
                )}
              </div>
            ))}
          </DefinitionList>
        </div>
      );
    case resourceVocabulary.nodes.responseSpace.nodeType: {
      const lines = node.lines ?? (node.kind === "lines" ? 4 : 6);
      const label =
        node.kind === "lines"
          ? `Answer space with ${lines} lines`
          : `Answer space: ${node.kind}`;
      return (
        <ResponseSpace aria-label={label} $kind={node.kind} $lines={lines} role="img" />
      );
    }
    case resourceVocabulary.nodes.table.nodeType:
      return <TablePreview node={node} />;
    case resourceVocabulary.nodes.codeBlock.nodeType:
      return (
        <CodeBlock aria-label={codeBlockLabel(node.language)} role="group" tabIndex={0}>
          <code data-language={node.language}>{node.source}</code>
        </CodeBlock>
      );
    case resourceVocabulary.nodes.figure.nodeType:
      return <FigureNode assets={assets} node={node} />;
    case resourceVocabulary.nodes.unsupported.nodeType:
      return (
        <Unsupported role="note">
          <strong>Some worksheet content cannot be previewed yet.</strong>{" "}
          {contentText(node)}
        </Unsupported>
      );
    default:
      return assertNever(node);
  }
}

function TableCellContent({
  cell,
  position,
}: Readonly<{ cell: TableCell; position: string }>) {
  switch (cell.kind) {
    case "content":
      return <InlineContentRenderer content={cell.content} />;
    case "answer":
      return (
        <AnswerCell>
          <HiddenLabel>Answer space, {position}</HiddenLabel>
        </AnswerCell>
      );
    case "empty":
      return null;
  }
}

/**
 * Cells are keyed by position because position is their only identity: blank
 * cells carry no content, and repeated headings and answers collide.
 */
function TablePreview({
  node,
}: Readonly<{ node: Extract<ResourceNode, { type: "table" }> }>) {
  return (
    <ScrollableRegion tabIndex={0}>
      <Table aria-label={tableLabel(node.role)}>
        {node.header && (
          <thead>
            <tr>
              {node.header.map((cell, columnIndex) => (
                <th
                  scope="col"
                  key={columnIndex}
                  tabIndex={cell.kind === "answer" ? 0 : undefined}
                >
                  <TableCellContent
                    cell={cell}
                    position={`header, column ${columnIndex + 1}`}
                  />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {node.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, columnIndex) => (
                <td key={columnIndex} tabIndex={cell.kind === "answer" ? 0 : undefined}>
                  <TableCellContent
                    cell={cell}
                    position={`row ${rowIndex + 1}, column ${columnIndex + 1}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </ScrollableRegion>
  );
}
