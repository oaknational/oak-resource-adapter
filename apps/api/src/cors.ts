import type { NextRequest } from "next/server";

const defaultAllowedOrigins = ["http://localhost:3000"];

function getAllowedOrigins(): string[] {
  const configuredOrigins = process.env.RESOURCE_ADAPTER_ALLOWED_ORIGINS;

  if (!configuredOrigins) {
    return defaultAllowedOrigins;
  }

  return configuredOrigins.split(",").map((origin) => origin.trim());
}

export function getCorsHeaders(
  request: NextRequest,
  allowedMethods = "POST, OPTIONS",
): HeadersInit {
  const origin = request.headers.get("origin");

  if (!origin || !getAllowedOrigins().includes(origin)) {
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
