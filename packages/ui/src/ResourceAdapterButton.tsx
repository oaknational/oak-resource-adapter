"use client";

import { useState } from "react";
import {
  OakButtonWithDropdown,
  OakPrimaryButton,
  OakSecondaryButton,
} from "@oaknational/oak-components";

import type { ResourceAdapterCapabilityId } from "./publicTypes.js";

export type ResourceAdapterCapabilityOption = Readonly<{
  id: ResourceAdapterCapabilityId;
  label: string;
}>;

export type ResourceAdapterButtonProps<
  TCapability extends ResourceAdapterCapabilityOption = ResourceAdapterCapabilityOption,
> = Readonly<{
  capabilities: readonly TCapability[];
  onSelectCapability: (capability: TCapability) => void;
}>;

/**
 * The lesson-page trigger. OWA decides where to place it after it has resolved
 * the available capabilities for the current lesson and teacher.
 */
export function ResourceAdapterButton<
  TCapability extends ResourceAdapterCapabilityOption,
>({ capabilities, onSelectCapability }: ResourceAdapterButtonProps<TCapability>) {
  const [menuInstance, setMenuInstance] = useState(0);

  if (capabilities.length === 0) {
    return null;
  }

  const [onlyCapability] = capabilities;

  if (capabilities.length === 1 && onlyCapability) {
    return (
      <OakPrimaryButton onClick={() => onSelectCapability(onlyCapability)}>
        {onlyCapability.label}
      </OakPrimaryButton>
    );
  }

  // Remounting is the only way to close the menu: the dropdown owns `isOpen`
  // and exposes no close callback, and its `closeOnChange` fires on mousedown
  // and keydown, unmounting the item before its click handler runs.
  return (
    <OakButtonWithDropdown
      ariaLabel="Create more with AI"
      buttonComponent={OakPrimaryButton}
      key={menuInstance}
      primaryActionText="Create more with AI"
    >
      {capabilities.map((capability) => (
        <OakSecondaryButton
          element="button"
          key={capability.id}
          onClick={() => {
            onSelectCapability(capability);
            setMenuInstance((instance) => instance + 1);
          }}
          role="menuitem"
        >
          {capability.label}
        </OakSecondaryButton>
      ))}
    </OakButtonWithDropdown>
  );
}
