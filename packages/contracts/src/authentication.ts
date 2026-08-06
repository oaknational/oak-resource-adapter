/**
 * The application derives this only after verifying the host's bearer token.
 * It deliberately contains the small set of claims service procedures need.
 */
export type ResourceAdapterAuthenticatedTeacher = Readonly<{
  organisationId: string | null;
  teacherId: string;
}>;
