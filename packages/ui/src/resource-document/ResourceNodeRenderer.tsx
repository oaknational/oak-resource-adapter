import { Fragment, type ReactNode } from "react";
import type {
  Asset,
  InlineContent,
  ResourceNode,
  UnsupportedNode,
} from "@oaknational/resource-document";
import { parseColor } from "@oaknational/oak-components";
import { styled } from "styled-components";

import { InlineContentRenderer } from "./InlineContentRenderer.js";

const ContentSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
  border-top: 1px solid ${parseColor("border-neutral")};
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

export function ResourceNodeListRenderer({
  assets,
  nodes,
  parentHeadingLevel,
  renderAfterNode,
}: Readonly<{
  assets: readonly Asset[];
  nodes: readonly ResourceNode[];
  parentHeadingLevel: ParentHeadingLevel;
  renderAfterNode?: (node: ResourceNode) => ReactNode;
}>) {
  let currentHeadingLevel = parentHeadingLevel;

  return nodes.map((node) => {
    const nodeParentHeadingLevel = currentHeadingLevel;

    if (node.type === "heading") {
      currentHeadingLevel = headingLevel(node.level);
    }

    return (
      <Fragment key={node.id}>
        <ResourceNodeRenderer
          assets={assets}
          node={node}
          parentHeadingLevel={nodeParentHeadingLevel}
          {...(renderAfterNode === undefined ? {} : { renderAfterNode })}
        />
        {renderAfterNode?.(node)}
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
  node,
  parentHeadingLevel,
  renderAfterNode,
}: Readonly<{
  assets: readonly Asset[];
  node: ResourceNode;
  parentHeadingLevel: ParentHeadingLevel;
  renderAfterNode?: (node: ResourceNode) => ReactNode;
}>) {
  switch (node.type) {
    case "section":
      return (
        <ContentSection>
          <ResourceNodeListRenderer
            assets={assets}
            nodes={node.children}
            parentHeadingLevel={parentHeadingLevel}
            {...(renderAfterNode === undefined ? {} : { renderAfterNode })}
          />
        </ContentSection>
      );
    case "heading":
      return (
        <Heading level={headingLevel(node.level)}>
          <InlineContentRenderer content={node.content} />
        </Heading>
      );
    case "paragraph":
      return (
        <Paragraph>
          <InlineContentRenderer content={node.content} />
        </Paragraph>
      );
    case "callout":
      return (
        <Callout>
          <strong>{CalloutLabels[node.role]}: </strong>
          <InlineContentRenderer content={node.content} />
        </Callout>
      );
    case "question": {
      const label = node.label ? `Question ${node.label}` : "Question";
      const questionHeadingLevel = nestedHeadingLevel(parentHeadingLevel);
      const marks = node.marks === undefined ? "" : ` (${pluralisedMarks(node.marks)})`;
      return (
        <Question>
          <Heading level={questionHeadingLevel}>{`${label}${marks}`}</Heading>
          <QuestionContent>
            <ResourceNodeListRenderer
              assets={assets}
              nodes={node.children}
              parentHeadingLevel={questionHeadingLevel}
              {...(renderAfterNode === undefined ? {} : { renderAfterNode })}
            />
          </QuestionContent>
        </Question>
      );
    }
    case "definitionList":
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
    case "responseSpace": {
      const lines = node.lines ?? (node.kind === "lines" ? 4 : 6);
      const label =
        node.kind === "lines"
          ? `Answer space with ${lines} lines`
          : `Answer space: ${node.kind}`;
      return (
        <ResponseSpace aria-label={label} $kind={node.kind} $lines={lines} role="img" />
      );
    }
    case "figure":
      return <FigureNode assets={assets} node={node} />;
    case "unsupported":
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
