"use client";

import {
  OakGlobalStyle,
  OakThemeProvider,
  oakDefaultTheme,
} from "@oaknational/oak-components";
import type { ReactNode } from "react";

export function HarnessProviders({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <OakThemeProvider theme={oakDefaultTheme}>
      <OakGlobalStyle />
      {children}
    </OakThemeProvider>
  );
}
