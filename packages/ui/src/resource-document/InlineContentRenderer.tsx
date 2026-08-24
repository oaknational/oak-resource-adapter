import type { InlineContent, InlineRun } from "@oaknational/resource-document";
import { styled } from "styled-components";

const InlineMath = styled.span`
  font-family: "Times New Roman", serif;
  white-space: pre-wrap;
`;

const DisplayMath = styled(InlineMath)`
  display: block;
  margin-block: 0.75rem;
  overflow-x: auto;
  text-align: center;
`;

const symbols = {
  "\\times": "×",
  "\\div": "÷",
  "\\square": "□",
  "\\leq": "≤",
  "\\geq": "≥",
  "\\neq": "≠",
  "\\pm": "±",
  "\\cdot": "·",
} as const;

function applySymbols(value: string): string {
  return Object.entries(symbols).reduce(
    (result, [command, symbol]) => result.replaceAll(command, symbol),
    value,
  );
}

function readableMath(value: string): string {
  return applySymbols(value).replaceAll(/\\[,;:!]/g, " ");
}

/**
 * A screen reader would otherwise read an unmapped command literally, as
 * "backslash f r a c". Commands and braces we cannot say are dropped so the
 * operands still come through.
 */
function spokenMath(value: string): string {
  return applySymbols(value)
    .replaceAll(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1 over $2")
    .replaceAll(/\\sqrt\s*\{([^{}]*)\}/g, "square root of $1")
    .replaceAll(/\^\s*\{?2\}?/g, " squared")
    .replaceAll(/\\[a-zA-Z]+/g, " ")
    .replaceAll(/[{}\\]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function MathRun({ run }: Readonly<{ run: Extract<InlineRun, { type: "math" }> }>) {
  const Component = run.display ? DisplayMath : InlineMath;

  return (
    <Component
      aria-label={`Mathematical expression: ${spokenMath(run.value)}`}
      role="math"
      // The display variant scrolls, so it has to be reachable by keyboard.
      tabIndex={run.display ? 0 : undefined}
    >
      {readableMath(run.value)}
    </Component>
  );
}

export function InlineContentRenderer({
  content,
}: Readonly<{ content: InlineContent }>) {
  return content.map((run, index) =>
    run.type === "text" ? (
      run.text
    ) : (
      // Position, because an expression can legitimately repeat within one run
      // of content, and content is immutable once parsed.
      <MathRun key={index} run={run} />
    ),
  );
}
