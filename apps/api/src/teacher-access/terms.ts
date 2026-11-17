import { clerkClient } from "@clerk/nextjs/server";
import type {
  TermsAcceptRequest,
  TermsState,
} from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import { LATEST_ORA_TERMS_VERSION, REQUIRED_ORA_TERMS_VERSION } from "./access";
import { teacherAccessResolver, type TeacherAccessResolver } from "./resolver";

export type WriteOraMetadata = (
  teacherId: string,
  ora: Readonly<Record<string, unknown>>,
) => Promise<void>;

// Clerk deep-merges `privateMetadata`, and a null removes its key.
const writeOraMetadataInClerk: WriteOraMetadata = async (teacherId, ora) => {
  await (
    await clerkClient()
  ).users.updateUserMetadata(teacherId, { privateMetadata: { ora } });
};

type TermsDependencies = Readonly<{
  access: Pick<TeacherAccessResolver, "forget" | "resolve">;
  now: () => Date;
  write: WriteOraMetadata;
}>;

const defaultDependencies: TermsDependencies = {
  access: teacherAccessResolver,
  now: () => new Date(),
  write: writeOraMetadataInClerk,
};

export async function getTermsState(
  { teacherId }: ResourceAdapterAuthenticatedTeacher,
  { access }: Pick<TermsDependencies, "access"> = defaultDependencies,
): Promise<TermsState> {
  return { accepted: (await access.resolve(teacherId)).termsAccepted };
}

/** Records the version the teacher was shown, if ORA still accepts it. */
export async function acceptTerms(
  { version }: TermsAcceptRequest,
  { teacherId }: ResourceAdapterAuthenticatedTeacher,
  { now, write }: Pick<TermsDependencies, "now" | "write"> = defaultDependencies,
): Promise<TermsState> {
  if (version < REQUIRED_ORA_TERMS_VERSION || version > LATEST_ORA_TERMS_VERSION) {
    return { accepted: false };
  }
  await write(teacherId, {
    acceptedTerms: { version, acceptedAt: now().toISOString() },
  });
  return { accepted: true };
}

export async function clearTermsAcceptance(
  teacherId: string,
  { access, write }: Pick<TermsDependencies, "access" | "write"> = defaultDependencies,
): Promise<void> {
  await write(teacherId, { acceptedTerms: null });
  access.forget(teacherId);
}
