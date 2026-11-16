"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { OakBox, OakFlex, getBreakpoint } from "@oaknational/oak-components";
import { styled } from "styled-components";

import { VisibleLoadingSpinner } from "./VisibleLoadingSpinner.js";

// Figma's spacing is drawn for a 1150px-tall desktop frame and a 750px-tall
// phone frame, so each gap shrinks with the viewport's height up to that value.
const Layout = styled.div`
  --padding-max: 3.5rem;

  @media (min-width: ${getBreakpoint("small")}px) {
    --padding-max: 5rem;
  }

  @media (min-width: ${getBreakpoint("large")}px) {
    --padding-max: 7.5rem;
  }

  display: flex;
  justify-content: center;
  padding-block: clamp(1.5rem, 10svh, var(--padding-max));
  width: 100%;
`;

/**
 * A loading state shown in the dialog body: a spinner beside an h3 that takes
 * focus, with any further content centred below it.
 */
export function DialogLoading({
  children,
  heading,
}: Readonly<{ heading: string; children?: ReactNode }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
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
        {children}
      </OakFlex>
    </Layout>
  );
}
