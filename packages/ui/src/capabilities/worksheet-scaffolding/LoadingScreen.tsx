"use client";

import { useEffect, useRef, useState } from "react";
import { OakBox, OakFlex, OakP, getBreakpoint } from "@oaknational/oak-components";
import { styled } from "styled-components";

import { PlaceholderScaffoldIllustration } from "./PlaceholderScaffoldIllustration.js";
import { pickScaffoldTip } from "./scaffoldTips.js";
import { VisibleLoadingSpinner } from "./styles.js";

// Figma's spacing is drawn for a 1150px-tall desktop frame and a 750px-tall
// phone frame, so each gap shrinks with the viewport's height up to that value.
const Layout = styled.div`
  --padding-max: 3.5rem;
  --above-image-max: 6.25rem;
  --below-image-max: 3rem;

  @media (min-width: ${getBreakpoint("small")}px) {
    --padding-max: 5rem;
    --above-image-max: 7.5rem;
    --below-image-max: 3.5rem;
  }

  @media (min-width: ${getBreakpoint("large")}px) {
    --padding-max: 7.5rem;
    --above-image-max: 10rem;
    --below-image-max: 4.5rem;
  }

  display: flex;
  justify-content: center;
  padding-block: clamp(1.5rem, 10svh, var(--padding-max));
  width: 100%;
`;

const IllustrationSlot = styled.div`
  padding-block: clamp(2rem, 14svh, var(--above-image-max))
    clamp(1.5rem, 6svh, var(--below-image-max));
  width: min(64%, 34svh);
`;

export function LoadingScreen({ heading }: Readonly<{ heading: string }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Chosen after mounting, so server and browser markup match.
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
    setTip(pickScaffoldTip());
  }, []);

  return (
    <Layout>
      <OakFlex
        $alignItems="center"
        $flexDirection="column"
        $textAlign="center"
        $width={["100%", "50%"]}
      >
        <OakFlex $alignItems="center" $gap="spacing-12">
          <VisibleLoadingSpinner aria-hidden="true" />
          <OakBox
            as="h3"
            $font="heading-5"
            $ma="spacing-0"
            ref={headingRef}
            tabIndex={-1}
          >
            {heading}
          </OakBox>
        </OakFlex>
        <IllustrationSlot>
          <PlaceholderScaffoldIllustration />
        </IllustrationSlot>
        <OakP $font="heading-light-6">{tip}</OakP>
      </OakFlex>
    </Layout>
  );
}
