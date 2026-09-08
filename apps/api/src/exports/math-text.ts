// Note: We will likely replace this with a proper LaTeX->Equation mapper for more accurate rendering.

const symbols: Readonly<Record<string, string>> = {
  "\\times": "×",
  "\\div": "÷",
  "\\square": "□",
  "\\cdot": "·",
  "\\pm": "±",
  "\\mp": "∓",
  "\\leq": "≤",
  "\\le": "≤",
  "\\geq": "≥",
  "\\ge": "≥",
  "\\neq": "≠",
  "\\ne": "≠",
  "\\approx": "≈",
  "\\equiv": "≡",
  "\\infty": "∞",
};

export function readableMathText(value: string): string {
  // Consume whole control sequences, including escaped backslashes, without parsing LaTeX structure.
  return value.replace(
    /\\(?:[a-zA-Z]+|[^a-zA-Z])/g,
    (command) => symbols[command] ?? command,
  );
}
