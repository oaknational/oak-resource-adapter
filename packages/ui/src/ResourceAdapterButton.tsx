"use client";

import {
  OakButtonWithDropdown,
  OakSecondaryButton,
  useDropdownContext,
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
  if (capabilities.length === 0) {
    return null;
  }

  const [onlyCapability] = capabilities;

  if (capabilities.length === 1 && onlyCapability) {
    return (
      <OakSecondaryButton
        iconName="ai"
        onClick={() => onSelectCapability(onlyCapability)}
      >
        {onlyCapability.label}
      </OakSecondaryButton>
    );
  }

  return (
    <OakButtonWithDropdown
      buttonComponent={OakSecondaryButton}
      primaryActionIcon="ai"
      primaryActionText="Adapt with AI"
    >
      {capabilities.map((capability) => (
        <CapabilityMenuItem
          capability={capability}
          key={capability.id}
          onSelectCapability={onSelectCapability}
        />
      ))}
    </OakButtonWithDropdown>
  );
}

function CapabilityMenuItem<TCapability extends ResourceAdapterCapabilityOption>({
  capability,
  onSelectCapability,
}: Readonly<{
  capability: TCapability;
  onSelectCapability: (capability: TCapability) => void;
}>) {
  const { onClose } = useDropdownContext();

  return (
    <OakSecondaryButton
      element="button"
      iconName="ai"
      onClick={() => {
        onSelectCapability(capability);
        onClose();
      }}
      role="menuitem"
    >
      {capability.label}
    </OakSecondaryButton>
  );
}
