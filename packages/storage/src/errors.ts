export function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The deepest message in a `cause` chain. Each layer adds context that is
 * carried as its own field here, so only the innermost reads as the reason.
 */
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
