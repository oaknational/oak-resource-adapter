import * as z from "zod/mini";

export const resourceAdapterFeatureFlagsResponseSchema = z.readonly(
  z.array(z.string().check(z.minLength(1))),
);

export type ResourceAdapterFeatureFlagsResponse = z.infer<
  typeof resourceAdapterFeatureFlagsResponseSchema
>;
