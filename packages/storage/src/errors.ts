export function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function describeRootCause(error: unknown): string {
  let current = error;

  for (let depth = 0; depth < 8; depth += 1) {
    if (!(current instanceof Error) || current.cause === undefined) {
      break;
    }

    current = current.cause;
  }

  return describeCause(current);
}
