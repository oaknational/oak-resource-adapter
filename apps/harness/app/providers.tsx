"use client";

import {
  OakGlobalStyle,
  OakThemeProvider,
  oakDefaultTheme,
} from "@oaknational/oak-components";
import type { ReactNode } from "react";

import { useHarnessAnalyticsIdentity } from "./_hooks/useHarnessAnalytics";
import { StyledComponentsRegistry } from "./styled-components-registry";

export function HarnessProviders({ children }: Readonly<{ children: ReactNode }>) {
  useHarnessAnalyticsIdentity();
  return (
    <StyledComponentsRegistry>
      <OakThemeProvider theme={oakDefaultTheme}>
        <OakGlobalStyle />
        {children}
      </OakThemeProvider>
    </StyledComponentsRegistry>
  );
}
