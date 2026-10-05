"use client";

import { parseColor } from "@oaknational/oak-components";
import { keyframes, styled } from "styled-components";

export const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const rotateLoadingSpinner = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

export const VisibleLoadingSpinner = styled.span`
  animation: ${rotateLoadingSpinner} 1.2s linear infinite;
  border: 0.1875rem solid ${parseColor("icon-primary")};
  border-radius: 50%;
  border-right-color: transparent;
  box-sizing: border-box;
  display: block;
  height: 1.5rem;
  width: 1.5rem;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
