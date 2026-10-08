import type { z } from "zod";

import type { JobJsonValue } from "./domain";

export type JobDefinition<
  TKind extends string,
  TInputSchema extends z.ZodType<JobJsonValue>,
  TInvokesModel extends boolean = boolean,
> = {
  kind: TKind;
  input: TInputSchema;
  /** A job that invokes a model counts towards the requesting teacher's usage. */
  invokesModel: TInvokesModel;
};

export function defineJob<
  const TKind extends string,
  TInputSchema extends z.ZodType<JobJsonValue>,
  const TInvokesModel extends boolean,
>(
  definition: JobDefinition<TKind, TInputSchema, TInvokesModel>,
): JobDefinition<TKind, TInputSchema, TInvokesModel> {
  return definition;
}
