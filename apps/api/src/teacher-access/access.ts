import { z } from "zod";

/** ISO 3166-1 alpha-2 codes, as OWA and Aila store them in `privateMetadata.region`. */
export const FULL_ACCESS_REGIONS: readonly string[] = ["GB", "IM", "JE", "GG"];

export type TeacherAccess = Readonly<{
  tier: "full" | "limited";
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

export function teacherAccessFromMetadata(privateMetadata: unknown): TeacherAccess {
  const { region, ora } = privateMetadataSchema.safeParse(privateMetadata).data ?? {};
  const inFullAccessRegion =
    region !== undefined && FULL_ACCESS_REGIONS.includes(region);
  const modelJobsPer24h = ora?.usageLimits?.modelJobsPer24h;
  return {
    tier: inFullAccessRegion || ora?.access === "full" ? "full" : "limited",
    ...(modelJobsPer24h === undefined ? {} : { modelJobsPer24h }),
  };
}
