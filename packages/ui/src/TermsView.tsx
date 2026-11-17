"use client";

import { OakLink, OakP, OakScreenReader } from "@oaknational/oak-components";

import { DialogNotice } from "./DialogNotice.js";
import { termsCopy } from "./termsCopy.js";

export function TermsView({
  isAccepting,
  onAccept,
  onBack,
  problem,
}: Readonly<{
  problem: "acceptFailed" | "outdated" | null;
  isAccepting: boolean;
  onAccept: (version: number) => void;
  onBack: () => void;
}>) {
  return (
    <DialogNotice
      heading={termsCopy.heading}
      primaryAction={{
        isLoading: isAccepting,
        label: termsCopy.accept,
        onClick: () => onAccept(termsCopy.version),
      }}
      secondaryAction={{ label: termsCopy.back, onClick: onBack }}
    >
      {termsCopy.paragraphs.map((parts) => (
        <OakP
          $font="body-2"
          key={parts
            .map((part) => (typeof part === "string" ? part : part.label))
            .join("")}
        >
          {parts.map((part) =>
            typeof part === "string" ? (
              part
            ) : (
              <OakLink href={part.href} key={part.href} rel="noopener" target="_blank">
                {part.label}
                <OakScreenReader>{" (opens in a new tab)"}</OakScreenReader>
              </OakLink>
            ),
          )}
        </OakP>
      ))}
      {problem !== null && (
        <OakP $color="text-error" $font="body-2" role="alert">
          {termsCopy[problem]}
        </OakP>
      )}
    </DialogNotice>
  );
}
