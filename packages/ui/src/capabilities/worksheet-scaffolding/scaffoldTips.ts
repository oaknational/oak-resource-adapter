export const SCAFFOLD_TIPS = [
  "Aila's scaffolds are generated from carefully designed prompts, informed by best practice.",
  "Aila reads this lesson's keywords and key learning points, so its suggestions fit what the lesson teaches.",
  "You'll see each scaffold on your worksheet before you keep it, and you can undo any you don't want.",
  "Oak's original worksheet never changes. You can always start again from the original.",
  "Your adapted worksheet is saved, so you can close this and come back to it later.",
] as const;

export function pickScaffoldTip(random: () => number = Math.random): string {
  return SCAFFOLD_TIPS[Math.floor(random() * SCAFFOLD_TIPS.length)] ?? SCAFFOLD_TIPS[0];
}
