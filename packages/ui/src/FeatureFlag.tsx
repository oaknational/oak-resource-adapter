"use client";

import { type ReactNode } from "react";

export type FeatureFlagProps = Readonly<{
  children: ReactNode;
  enabledFlags?: readonly string[];
  flag: string;
}>;

/**
 * Renders `children` only when the requested flag is included in
 * `enabledFlags`.
 */
export function FeatureFlag({ children, enabledFlags, flag }: FeatureFlagProps) {
  const availableFlags = enabledFlags ?? [];

  if (!availableFlags.includes(flag)) {
    return null;
  }

  return <>{children}</>;
}
