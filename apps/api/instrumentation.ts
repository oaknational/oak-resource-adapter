import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Opens the Cloud SQL connection before anything queries, where the
    // deployment uses OIDC rather than a DATABASE_URL. A no-op otherwise, so
    // local development and CI are unaffected.
    const { initialiseDatabaseClient } =
      await import("@oaknational/resource-adapter-db");

    await initialiseDatabaseClient();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Automatically captures unhandled errors from route handlers / server components.
export const onRequestError = Sentry.captureRequestError;
