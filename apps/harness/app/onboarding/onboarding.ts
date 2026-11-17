import { z } from "zod";

/** The regions a tester can pick. The first four are ORA's copyright regions. */
export const STAND_IN_REGIONS = [
  { code: "GB", label: "United Kingdom (GB)" },
  { code: "IM", label: "Isle of Man (IM)" },
  { code: "JE", label: "Jersey (JE)" },
  { code: "GG", label: "Guernsey (GG)" },
  { code: "IE", label: "Ireland (IE)" },
  { code: "US", label: "United States (US)" },
] as const;

export const NO_REGION = "none";

/** An ISO 3166-1 alpha-2 code, as OWA stores it, or null for no region. */
export function parseRegion(value: FormDataEntryValue | null): string | null {
  if (value === NO_REGION) return null;
  if (typeof value === "string" && /^[A-Z]{2}$/.test(value)) return value;
  throw new Error("Choose a region from the list.");
}

export function isListedRegion(region: string): boolean {
  return STAND_IN_REGIONS.some(({ code }) => code === region);
}

/** What the account already has, so setting up again changes nothing unless chosen. */
export function initialRegionChoice({
  onboarded,
  region,
}: Readonly<{ onboarded: boolean; region: string | null }>): string {
  if (region !== null) return region;
  return onboarded ? NO_REGION : "GB";
}

const HARNESS_ORIGIN = "https://harness.invalid";

/** A same-origin path, so the stand-in cannot be used as an open redirect. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string") return "/";
  try {
    const url = new URL(value, HARNESS_ORIGIN);
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Checked after normalisation too: `/.//example.com` normalises to `//example.com`.
    return url.origin === HARNESS_ORIGIN && !path.startsWith("//") ? path : "/";
  } catch {
    return "/";
  }
}

export function isDevelopmentClerkInstance(secretKey: string | undefined): boolean {
  return secretKey?.startsWith("sk_test_") === true;
}

const metadataSchema = z.object({
  publicMetadata: z.object({
    owa: z
      .object({ isOnboarded: z.boolean().optional().catch(undefined) })
      .optional()
      .catch(undefined),
  }),
  privateMetadata: z.object({ region: z.string().optional().catch(undefined) }),
});

export function onboardingOf(user: unknown): {
  onboarded: boolean;
  region: string | null;
} {
  const parsed = metadataSchema.safeParse(user).data;
  return {
    onboarded: parsed?.publicMetadata.owa?.isOnboarded === true,
    region: parsed?.privateMetadata.region ?? null,
  };
}

const termsSchema = z.object({
  privateMetadata: z.object({
    ora: z
      .object({
        acceptedTerms: z
          .object({ version: z.number(), acceptedAt: z.string() })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  }),
});

export type AcceptedTerms = Readonly<{ version: number; acceptedAt: string }>;

export function acceptedTermsOf(user: unknown): AcceptedTerms | null {
  return termsSchema.safeParse(user).data?.privateMetadata.ora?.acceptedTerms ?? null;
}
