"use client";

import { styled } from "styled-components";

export const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  /* Oak buttons size to their label, which overflows a narrow banner. */
  && > * {
    max-width: 100%;
    width: auto;
  }
`;
