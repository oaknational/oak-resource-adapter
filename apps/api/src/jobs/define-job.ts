import type { z } from "zod";

import type { JobJsonValue } from "./domain";

export type JobDefinition<
  TKind extends string,
  TInputSchema extends z.ZodType<JobJsonValue>,
> = {
  kind: TKind;
  input: TInputSchema;
};

export function defineJob<
  const TKind extends string,
  TInputSchema extends z.ZodType<JobJsonValue>,
>(definition: JobDefinition<TKind, TInputSchema>): JobDefinition<TKind, TInputSchema> {
  return definition;
}
