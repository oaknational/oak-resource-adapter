"use client";

import { useEffect, useState } from "react";
import { OakP, getBreakpoint } from "@oaknational/oak-components";
import { styled } from "styled-components";

import { DialogLoading } from "../../DialogLoading.js";
import { PlaceholderScaffoldIllustration } from "./PlaceholderScaffoldIllustration.js";
import { pickScaffoldTip } from "./scaffoldTips.js";

// Shrinks with the viewport's height up to Figma's value, as DialogLoading does.
const IllustrationSlot = styled.div`
  --above-image-max: 6.25rem;
  --below-image-max: 3rem;

  @media (min-width: ${getBreakpoint("small")}px) {
    --above-image-max: 7.5rem;
    --below-image-max: 3.5rem;
  }

  @media (min-width: ${getBreakpoint("large")}px) {
    --above-image-max: 10rem;
    --below-image-max: 4.5rem;
  }

  padding-block: clamp(2rem, 14svh, var(--above-image-max))
    clamp(1.5rem, 6svh, var(--below-image-max));
  width: min(64%, 34svh);
`;

export function LoadingScreen({ heading }: Readonly<{ heading: string }>) {
  // Chosen after mounting, so server and browser markup match.
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    setTip(pickScaffoldTip());
  }, []);

  return (
    <DialogLoading heading={heading}>
      <IllustrationSlot>
        <PlaceholderScaffoldIllustration />
      </IllustrationSlot>
      <OakP $font="heading-light-6">{tip}</OakP>
    </DialogLoading>
  );
}
