import { z } from "zod";

/** ISO 3166-1 alpha-2 codes, as OWA and Aila store them in `privateMetadata.region`. */
export const FULL_ACCESS_REGIONS: readonly string[] = ["GB", "IM", "JE", "GG"];

/** OWA's `ALLOWED_REGIONS`, which gate its geo-restricted downloads. */
export const COPYRIGHT_REGIONS: readonly string[] = ["GB", "IM", "JE", "GG"];

export const OAK_MODEL_JOBS_PER_24H = 1000;

export const RATE_LIMIT_ME_MODEL_JOBS_PER_24H = 5;

export type TeacherAccess = Readonly<{
  tier: "full" | "limited";
  /** Whether geo-restricted lessons are offered. A grant does not change it. */
  inCopyrightRegion: boolean;
  /** Replaces `USAGE_LIMIT_MODEL_JOBS_PER_24H` for this teacher. */
  modelJobsPer24h?: number;
}>;

// Each field falls back on its own, so one malformed value never discards the rest.
// Aila's `customRateLimit` counts Aila generations. ORA must not read it.
const privateMetadataSchema = z.object({
  region: z.string().optional().catch(undefined),
  ora: z
    .object({
      access: z.literal("full").optional().catch(undefined),
      usageLimits: z
        .object({ modelJobsPer24h: z.int().positive().optional().catch(undefined) })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
});

type ClerkEmailAddress = Readonly<{
  emailAddress: string;
  verification: Readonly<{ status: string }> | null;
}>;

export type ClerkUser = Readonly<{
  privateMetadata: unknown;
  emailAddresses: readonly ClerkEmailAddress[];
}>;

// Clerk returns unverified addresses, which anyone can add to their account.
// Every rule, the test markers included, must read only from this list.
function verifiedOakAddresses(emailAddresses: readonly ClerkEmailAddress[]): string[] {
  return emailAddresses
    .filter(
      ({ emailAddress, verification }) =>
        emailAddress.endsWith("@thenational.academy") &&
        verification?.status === "verified",
    )
    .map(({ emailAddress }) => emailAddress);
}

function hasMarker(oakAddresses: readonly string[], marker: string): boolean {
  return oakAddresses.some((address) => address.includes(marker));
}

function oakModelJobsPer24h(oakAddresses: readonly string[]): number | undefined {
  if (hasMarker(oakAddresses, "rate-limit-me")) {
    return RATE_LIMIT_ME_MODEL_JOBS_PER_24H;
  }
  if (oakAddresses.length === 0 || hasMarker(oakAddresses, "access-limit-me")) {
    return undefined;
  }
  return OAK_MODEL_JOBS_PER_24H;
}

export function teacherAccessFromClerkUser({
  privateMetadata,
  emailAddresses,
}: ClerkUser): TeacherAccess {
  const { region, ora } = privateMetadataSchema.safeParse(privateMetadata).data ?? {};
  const oakAddresses = verifiedOakAddresses(emailAddresses);
  const granted = ora?.access === "full";
  const behavesOutsideUk = !granted && hasMarker(oakAddresses, "access-limit-me");
  const inRegion = (regions: readonly string[]) =>
    region !== undefined && regions.includes(region);
  const modelJobsPer24h =
    ora?.usageLimits?.modelJobsPer24h ?? oakModelJobsPer24h(oakAddresses);
  return {
    tier:
      !behavesOutsideUk &&
      (granted || oakAddresses.length > 0 || inRegion(FULL_ACCESS_REGIONS))
        ? "full"
        : "limited",
    inCopyrightRegion: !behavesOutsideUk && inRegion(COPYRIGHT_REGIONS),
    ...(modelJobsPer24h === undefined ? {} : { modelJobsPer24h }),
  };
}
