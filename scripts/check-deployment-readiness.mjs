import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

/** Every check and code apps/api/src/health/readiness.ts can report as failing. */
const reportableFailures = new Set([
  "modelConfiguration=MISSING_OPENAI_API_KEY",
  "modelConfiguration=UNKNOWN_MODEL_TRANSPORT",
  "modelConfiguration=DETERMINISTIC_TRANSPORT_FORBIDDEN",
  "database=DATABASE_NOT_CONFIGURED",
  "database=DATABASE_CERTIFICATE_REJECTED",
  "database=DATABASE_REFUSED_CONNECTION",
  "database=DATABASE_UNAVAILABLE",
]);

/**
 * Upstream identifiers can contain credentials even when they look like codes.
 * CI diagnostics must come from local literals, not response text, so a pair is
 * named only where it matches one above exactly and every other failing check is
 * reported without its identifiers.
 */
function summariseFailures(body) {
  const checks = body?.checks;
  if (typeof checks !== "object" || checks === null || Array.isArray(checks)) {
    return null;
  }
  const failed = new Set();
  for (const [name, check] of Object.entries(checks)) {
    if (check?.status !== "not-ready") {
      continue;
    }
    const pair = `${name}=${check.code}`;
    failed.add(reportableFailures.has(pair) ? pair : "unrecognised failing check");
  }
  return failed.size > 0 ? [...failed].join(", ") : null;
}

/** Retrying only helps while a failing check says its readiness can still arrive. */
function isTerminal(body) {
  const checks = body?.checks;
  if (typeof checks !== "object" || checks === null || Array.isArray(checks)) {
    return false;
  }
  const failed = Object.values(checks).filter((check) => check?.status === "not-ready");
  return failed.length > 0 && failed.every((check) => check.retryable === false);
}

export async function checkDeploymentReadiness(
  { url, bypassSecret },
  { fetch: request = globalThis.fetch, wait = setTimeout, log = console.log } = {},
) {
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    log("::error::A valid readiness URL is required.");
    return false;
  }
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password
  ) {
    log("::error::Readiness requires an HTTP(S) URL without embedded credentials.");
    return false;
  }

  if (!bypassSecret) {
    log("No bypass secret supplied: a protected deployment answers with its wall.");
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    let failure = "request failed or timed out";
    let terminal = false;
    try {
      const response = await request(endpoint, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
        headers: bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {},
      });
      const body = await response.json().catch(() => undefined);
      if (response.status === 200 && body?.status === "ready") {
        log("API readiness confirmed.");
        return true;
      }
      failure =
        response.status === 200
          ? "response did not report ready"
          : `HTTP ${response.status}`;
      const failing = summariseFailures(body);
      if (failing) {
        failure += ` (${failing})`;
      }
      terminal = isTerminal(body);
    } catch {
      // Neither upstream response bodies nor thrown errors are safe to log.
    }
    log(`Readiness attempt ${attempt}/5: ${failure}.`);
    if (terminal) {
      log("::error::API readiness cannot change without a new deployment.");
      return false;
    }
    if (attempt < 5) await wait(10_000);
  }
  log("::error::API readiness check failed.");
  return false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ready = await checkDeploymentReadiness({
    url: process.argv[2],
    bypassSecret: process.env.BYPASS_SECRET,
  });
  process.exitCode = ready ? 0 : 1;
}
