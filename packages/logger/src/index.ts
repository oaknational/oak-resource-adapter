import debug from "debug";

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_DEBUG) {
  debug.enable(process.env.NEXT_PUBLIC_DEBUG);
}

const debugBase = debug("ra");
// By default debug logs to stderr, we want to use stdout
debugBase.log = console.log.bind(console);

export type LoggerKey =
  "ai" | "auth" | "capabilities" | "feature-flags" | "harness" | "internal-api";

/**
 * A pluggable error reporter (e.g. `Sentry.captureException`). The logger stays
 * dependency-free; apps inject a reporter at boot via {@link setErrorReporter}.
 */
type ErrorReporter = (error: unknown) => void;

const g = globalThis as { __raErrorReporter?: ErrorReporter };

/**
 * Register the error reporter used by `log.error(err, { report: true })`.
 */
export function setErrorReporter(fn: ErrorReporter): void {
  g.__raErrorReporter = fn;
}

export function resetErrorReporter(): void {
  delete g.__raErrorReporter;
}

/**
 * The logger uses namespaces so that we can selectively toggle noisy logs.
 * Logs are selected with the DEBUG environment variable.
 * Error logs are always shown.
 *
 * @example Include all logs except the database
 * DEBUG=ra:*,-ra:db
 *
 * @example Usage in a module
 * import { raLogger } from "@oaknational/resource-adapter-logger";
 *
 * const log = raLogger("db");
 * log.info("Hello world");
 */
export function raLogger(childKey: LoggerKey) {
  const debugLogger = debugBase.extend(childKey);

  const tableLogger = (tabularData: unknown[], columns?: string[]) => {
    if (typeof console !== "undefined" && console.table) {
      console.table(tabularData, columns);
    }
  };
  return {
    info: debugLogger,
    warn: debugLogger,
    error: (error: unknown, opts?: { report?: boolean }) => {
      console.error(error);
      // `report: true` only forwards to a reporter when an app has registered
      // one via `setErrorReporter` at boot. Today that is only the API (see
      // apps/api/src/sentry/init.ts); apps such as the harness register no
      // reporter, so `report: true` there is a no-op beyond the console.error
      // above.
      if (opts?.report && g.__raErrorReporter) {
        // A broken reporter must never mask the original error path.
        try {
          g.__raErrorReporter(error);
        } catch {
          // Swallow: the error is already on the console above.
        }
      }
    },
    table: tableLogger,
  };
}
