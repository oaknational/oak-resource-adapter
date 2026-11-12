"use client";

const SHEETS = [
  { x: 150, y: 146 },
  { x: 152, y: 116 },
  { x: 154, y: 86 },
  { x: 156, y: 56 },
] as const;

const RUNGS = [74, 86, 98, 110, 122, 134, 146, 158, 170] as const;

/** Stands in for the animated GIF on the loading screen until design supplies it. */
export function PlaceholderScaffoldIllustration() {
  return (
    <svg
      aria-hidden="true"
      data-testid="placeholder-scaffold-illustration"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={4}
      style={{ display: "block", height: "auto", width: "100%" }}
      viewBox="0 0 280 182"
    >
      <line x1={4} x2={276} y1={178} y2={178} />
      <line x1={70} x2={70} y1={62} y2={176} />
      <line x1={130} x2={130} y1={30} y2={176} />
      <rect height={10} width={76} x={62} y={52} />
      <line x1={82} x2={82} y1={62} y2={176} />
      <line x1={98} x2={98} y1={62} y2={176} />
      {RUNGS.map((y) => (
        <line key={y} strokeWidth={3} x1={82} x2={98} y1={y} y2={y} />
      ))}
      <line x1={110} x2={128} y1={176} y2={64} />
      <rect fill="currentColor" height={6} stroke="none" width={14} x={63} y={172} />
      <rect fill="currentColor" height={6} stroke="none" width={14} x={123} y={172} />
      {SHEETS.map(({ x, y }) => (
        <g key={y}>
          <rect fill="white" height={30} width={54} x={x} y={y} />
          <rect
            fill="currentColor"
            height={30}
            stroke="none"
            width={8}
            x={x + 46}
            y={y}
          />
          <line strokeWidth={3} x1={x + 8} x2={x + 26} y1={y + 10} y2={y + 10} />
          <line strokeWidth={3} x1={x + 8} x2={x + 20} y1={y + 18} y2={y + 18} />
        </g>
      ))}
      <line x1={168} x2={168} y1={56} y2={14} />
      <polygon
        fill="currentColor"
        points="168,12 198,12 189,21 198,30 168,30"
        stroke="none"
      />
    </svg>
  );
}
