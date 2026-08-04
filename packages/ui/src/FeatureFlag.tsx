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
  const isEnabled = availableFlags.includes(flag);

  if (isEnabled !== true) {
    return null;
  }

  return <>{children}</>;
}
