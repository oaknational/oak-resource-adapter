/** Public host and capability types shipped with the UI package. */
export type LessonResourceType = "starter-quiz" | "worksheet";

export type LessonContext = Readonly<{
  lessonSlug: string;
  programmeSlug: string;
  title: string;
  subjectSlug: string;
  keyStageSlug: string;
  availableResources: readonly LessonResourceType[];
}>;

export type ResourceAdapterCapabilityId = "worksheetAdapter";

export type ResourceAdapterCapability = Readonly<{
  id: ResourceAdapterCapabilityId;
  label: string;
  resourceType: LessonResourceType;
}>;

export type ResourceAdapterCapabilitiesRequest = Readonly<{
  contractVersion: number;
  lesson: LessonContext;
}>;

export type ResourceAdapterCapabilitiesResponse = Readonly<{
  capabilities: readonly ResourceAdapterCapability[];
}>;

export type GetToken = () => Promise<string | null>;

export type ResourceAdapterHostProps = Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  lesson: LessonContext;
}>;
