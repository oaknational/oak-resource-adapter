import { afterEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import {
  getAllowedOrigins,
  getAuthorizedParties,
  getCorsHeaders,
  isAllowedOrigin,
} from "./cors";

const previewPattern =
  "https://oak-resource-adapter-harness-*.vercel.thenational.academy";
const previewOrigin =
  "https://oak-resource-adapter-harness-4vtnsvhc2.vercel.thenational.academy";

function requestFrom(origin: string | null): NextRequest {
  return new Request(
    "http://localhost:3001/trpc/v1",
    origin ? { headers: { origin } } : undefined,
  ) as NextRequest;
}

afterEach(() => {
  delete process.env.RESOURCE_ADAPTER_ALLOWED_ORIGINS;
  delete process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS;
  delete process.env.VERCEL_ENV;
});

describe("getAllowedOrigins", () => {
  it("falls back to localhost when nothing is configured", () => {
    expect(getAllowedOrigins()).toEqual(["http://localhost:3000"]);
  });

  it("trims a configured list and drops empty entries", () => {
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGINS =
      " https://a.example.com , https://b.example.com ,";

    expect(getAllowedOrigins()).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });
});

describe("isAllowedOrigin", () => {
  it("allows an exactly configured origin and nothing else", () => {
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGINS = "https://a.example.com";

    expect(isAllowedOrigin("https://a.example.com")).toBe(true);
    expect(isAllowedOrigin("https://b.example.com")).toBe(false);
  });

  it("allows an origin matching a pattern under Oak's domain", () => {
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS = previewPattern;

    expect(isAllowedOrigin(previewOrigin)).toBe(true);
  });

  // The wildcard is only safe over a domain Oak controls. Anyone can register a
  // name under a shared apex, so a pattern written against one is discarded.
  it("ignores a pattern outside Oak's domain", () => {
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS =
      "https://oak-resource-adapter-harness-*.vercel.app";

    expect(
      isAllowedOrigin("https://oak-resource-adapter-harness-evil.vercel.app"),
    ).toBe(false);
  });

  it("does not let a pattern match across a dot", () => {
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS = previewPattern;

    expect(
      isAllowedOrigin(
        "https://oak-resource-adapter-harness-a.evil.vercel.thenational.academy",
      ),
    ).toBe(false);
  });

  it("anchors a pattern at both ends", () => {
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS = previewPattern;

    expect(isAllowedOrigin(`${previewOrigin}.evil.test`)).toBe(false);
    expect(isAllowedOrigin(`https://evil.test/${previewOrigin}`)).toBe(false);
  });

  it("ignores patterns in production, so the exact list fails closed", () => {
    process.env.VERCEL_ENV = "production";
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS = previewPattern;

    expect(isAllowedOrigin(previewOrigin)).toBe(false);
  });
});

describe("getAuthorizedParties", () => {
  it("returns the exact origins when the request has no origin", () => {
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGINS = "https://a.example.com";

    expect(getAuthorizedParties(requestFrom(null))).toEqual(["https://a.example.com"]);
  });

  it("adds a pattern-matched origin so Clerk can match its azp claim", () => {
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGINS = "https://a.example.com";
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS = previewPattern;

    expect(getAuthorizedParties(requestFrom(previewOrigin))).toEqual([
      "https://a.example.com",
      previewOrigin,
    ]);
  });

  it("does not add an origin that matches nothing", () => {
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGINS = "https://a.example.com";
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS = previewPattern;

    expect(getAuthorizedParties(requestFrom("https://evil.test"))).toEqual([
      "https://a.example.com",
    ]);
  });

  it("ignores patterns in production, so Clerk sees the exact list only", () => {
    process.env.VERCEL_ENV = "production";
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGINS = "https://a.example.com";
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS = previewPattern;

    expect(getAuthorizedParties(requestFrom(previewOrigin))).toEqual([
      "https://a.example.com",
    ]);
  });
});

describe("getCorsHeaders", () => {
  it("reflects a pattern-matched origin and varies on it", () => {
    process.env.RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS = previewPattern;

    expect(getCorsHeaders(requestFrom(previewOrigin))).toMatchObject({
      "Access-Control-Allow-Origin": previewOrigin,
      Vary: "Origin",
    });
  });

  it("returns no headers for a disallowed origin", () => {
    expect(getCorsHeaders(requestFrom("https://evil.test"))).toEqual({});
  });
});
