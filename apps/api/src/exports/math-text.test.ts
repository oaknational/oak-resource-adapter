import { describe, expect, it } from "vitest";

import { readableMathText } from "./math-text";

describe("plain-text maths symbols", () => {
  it.each([
    [
      String.raw`1 = 1 \times \square and 1 \div 1 = \square`,
      "1 = 1 × □ and 1 ÷ 1 = □",
    ],
    [String.raw`a\cdot b \pm c \mp d`, "a· b ± c ∓ d"],
    [String.raw`a\leq b\le c\geq d\ge e\neq f\ne g`, "a≤ b≤ c≥ d≥ e≠ f≠ g"],
    [String.raw`x\approx y\equiv z\times\infty`, "x≈ y≡ z×∞"],
    ["2 × 3 ÷ 1 = 6", "2 × 3 ÷ 1 = 6"],
    [
      String.raw`\timescale \divergence \squarely \leqslant \neqsim \newcommand`,
      String.raw`\timescale \divergence \squarely \leqslant \neqsim \newcommand`,
    ],
    [
      String.raw`\frac{1}{2} + \sqrt{x} + x^{2} + y_1`,
      String.raw`\frac{1}{2} + \sqrt{x} + x^{2} + y_1`,
    ],
    [
      String.raw`\\times \% \{x\} \unknown{a \times b}`,
      String.raw`\\times \% \{x\} \unknown{a × b}`,
    ],
    ["\\times\n\\div\t\\", "×\n÷\t\\"],
  ])("renders %s without discarding unknown notation", (input, output) => {
    expect(readableMathText(input)).toBe(output);
  });
});
