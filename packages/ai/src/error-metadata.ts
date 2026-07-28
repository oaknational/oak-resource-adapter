type ErrorMetadata = Readonly<{
  errorCode?: string;
  errorName: string;
  errorStatus?: number;
}>;

export function errorMetadata(error: unknown): ErrorMetadata {
  if (!(error instanceof Error)) {
    return { errorName: "UnknownModelInvocationError" };
  }

  const candidate = error as { code?: unknown; status?: unknown };
  return {
    errorName: error.name,
    ...(typeof candidate.status === "number" ? { errorStatus: candidate.status } : {}),
    ...(typeof candidate.code === "string" ? { errorCode: candidate.code } : {}),
  };
}

/** Renders {@link errorMetadata} for inclusion in a message. */
export function describeError(error: unknown): string {
  const { errorCode, errorName, errorStatus } = errorMetadata(error);
  return [
    errorName,
    errorStatus === undefined ? undefined : `status ${errorStatus}`,
    errorCode === undefined ? undefined : `code ${errorCode}`,
  ]
    .filter((part) => part !== undefined)
    .join(", ");
}
