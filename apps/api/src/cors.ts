import type { NextRequest } from "next/server";

const defaultAllowedOrigins = ["http://localhost:3000"];

/**
 * A wildcard origin is only safe over a domain Oak controls. Anyone can register
 * a name under a shared apex such as `vercel.app` and satisfy a pattern written
 * against it, so a pattern ending anywhere else is ignored rather than trusted.
 * Oak's Vercel team serves Preview deployments from `*.vercel.thenational.academy`.
 */
const trustedPatternSuffix = ".thenational.academy";

export function getAllowedOrigins(): string[] {
  const configuredOrigins = process.env.RESOURCE_ADAPTER_ALLOWED_ORIGINS;

  if (!configuredOrigins) {
    return defaultAllowedOrigins;
  }

  return configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Preview deployments get a new origin per pull request, so they cannot be
 * listed ahead of time. A pattern takes a single `*` standing for one hostname
 * label, as in `https://oak-resource-adapter-harness-*.vercel.thenational.academy`.
 */
function getAllowedOriginPatterns(): RegExp[] {
  // Production has one caller, OWA, on a known origin. Exact matches only.
  if (process.env.VERCEL_ENV === "production") {
    return [];
  }

  const configuredPatterns = process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS;

  if (!configuredPatterns) {
    return [];
  }

  return configuredPatterns
    .split(",")
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.endsWith(trustedPatternSuffix))
    .map(toOriginPattern);
}

// `*` excludes dots, so a pattern cannot match a longer host that merely ends
// with the expected suffix.
function toOriginPattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

  return new RegExp(`^${escaped.replaceAll(String.raw`\*`, "[a-z0-9-]+")}$`, "i");
}

export function isAllowedOrigin(origin: string): boolean {
  return (
    getAllowedOrigins().includes(origin) ||
    getAllowedOriginPatterns().some((pattern) => pattern.test(origin))
  );
}

/**
 * Clerk compares the token's `azp` claim against a fixed list, so a pattern has
 * to be resolved to the origin this request actually came from.
 */
export function getAuthorizedParties(request: Request): string[] {
  const exactOrigins = getAllowedOrigins();
  const origin = request.headers.get("origin");

  if (!origin || exactOrigins.includes(origin) || !isAllowedOrigin(origin)) {
    return exactOrigins;
  }

  return [...exactOrigins, origin];
}

export function getCorsHeaders(
  request: NextRequest,
  allowedMethods = "POST, OPTIONS",
): HeadersInit {
  const origin = request.headers.get("origin");

  if (!origin || !isAllowedOrigin(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Resource-Adapter-Contract-Version",
    "Access-Control-Allow-Methods": allowedMethods,
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}
