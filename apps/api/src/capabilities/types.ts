import type {
  LessonContext,
  ResourceAdapterCapability,
} from "@oaknational/resource-adapter-contracts";

export type EligibilityContext = Readonly<{
  lesson: LessonContext;
}>;

export type CapabilityDefinition = Readonly<
  ResourceAdapterCapability & {
    isEligible: (context: EligibilityContext) => boolean;
  }
>;
