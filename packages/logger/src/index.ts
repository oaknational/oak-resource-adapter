import debug from "debug";

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_DEBUG) {
  debug.enable(process.env.NEXT_PUBLIC_DEBUG);
}

const debugBase = debug("ra");
// By default debug logs to stderr, we want to use stdout
debugBase.log = console.log.bind(console);

export type LoggerKey = "capabilities" | "harness";

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
    error: console.error,
    table: tableLogger,
  };
}
