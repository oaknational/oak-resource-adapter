"use client";

import {
  OakGlobalStyle,
  OakThemeProvider,
  oakDefaultTheme,
} from "@oaknational/oak-components";
import type { ReactNode } from "react";

import { useHarnessAnalyticsIdentity } from "./_hooks/useHarnessAnalytics";

export function HarnessProviders({ children }: Readonly<{ children: ReactNode }>) {
  useHarnessAnalyticsIdentity();
  return (
    <OakThemeProvider theme={oakDefaultTheme}>
      <OakGlobalStyle />
      {children}
    </OakThemeProvider>
  );
}
