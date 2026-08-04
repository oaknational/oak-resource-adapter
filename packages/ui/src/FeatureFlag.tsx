"use client";

import { type ReactNode } from "react";

import type { FeatureFlagKey } from "./publicTypes.js";

export type FeatureFlagProps = Readonly<{
  children: ReactNode;
  enabledFlags?: readonly FeatureFlagKey[];
  flag: FeatureFlagKey;
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
