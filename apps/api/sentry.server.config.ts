// Node.js runtime entry point, dynamically imported by instrumentation.ts.
// Side-effectful on import so Sentry.init runs before any instrumented code.
import { initSentry } from "./src/sentry/init";

initSentry();
