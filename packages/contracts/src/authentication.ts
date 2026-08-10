/**
 * The application derives this only after verifying the host's bearer token.
 * It carries only the claims service procedures need.
 */
export type ResourceAdapterAuthenticatedTeacher = Readonly<{
  organisationId: string | null;
  teacherId: string;
}>;
