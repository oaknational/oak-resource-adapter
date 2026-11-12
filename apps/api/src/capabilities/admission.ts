import type { OriginalResourceDocumentLocator } from "@oaknational/resource-adapter-original-resource-documents";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import {
  readEligibilityContext,
  resolveLessonOffer,
  type EligibilityContextReader,
} from "./service";
import { capabilityDefinitions } from "./registry";
import {
  teacherAccessResolver,
  type TeacherAccessResolver,
} from "../teacher-access/resolver";

export type CapabilityAdmission =
  | Readonly<{ outcome: "needsSetup" }>
  | Readonly<{ outcome: "needsTerms" }>
  | Readonly<{ outcome: "unavailable" }>
  | Readonly<{ outcome: "admitted"; locator: OriginalResourceDocumentLocator }>;

export async function admitToCapability(
  { capabilityId, lesson }: Readonly<{ capabilityId: string; lesson: LessonContext }>,
  target: ResourceAdapterAuthenticatedTeacher,
  readContext: EligibilityContextReader = readEligibilityContext,
  access: Pick<TeacherAccessResolver, "resolve"> = teacherAccessResolver,
): Promise<CapabilityAdmission> {
  if (!Object.hasOwn(capabilityDefinitions, capabilityId)) {
    return { outcome: "unavailable" };
  }

  const offer = await resolveLessonOffer(lesson, target.teacherId, readContext, access);
  if (offer.outcome === "needsSetup") {
    return offer;
  }
  if (!offer.teacher.termsAccepted) {
    return { outcome: "needsTerms" };
  }
  const capability = offer.capabilities.find(({ id }) => id === capabilityId);
  if (capability === undefined) {
    return { outcome: "unavailable" };
  }

  return {
    outcome: "admitted",
    locator: {
      source: "oak",
      lessonSlug: lesson.lessonSlug,
      programmeSlug: lesson.programmeSlug,
      resourceType: capability.resourceType,
    },
  };
}
