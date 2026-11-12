import { lessonContextSchema } from "@oaknational/resource-adapter-contracts";
import { transformationInputSchema } from "@oaknational/resource-adapter-contracts/internal";
import { z } from "zod";

import { transformationStatusSchema } from "./transformations.js";

export type RuleConfigValue =
  | boolean
  | number
  | string
  | null
  | readonly RuleConfigValue[]
  | Readonly<{ [key: string]: RuleConfigValue }>;

/** A rule's config as the dev API returns it, so it must be plain JSON. */
export type RuleConfig = Readonly<Record<string, RuleConfigValue>>;

const ruleConfigSchema: z.ZodType<RuleConfig> = z.record(z.string(), z.json());

/** What a rule's check depends on. A rule that reads nothing is the same everywhere. */
export const ruleInputSchema = z.enum(["adaptation", "lesson", "resource", "teacher"]);

export type RuleInput = z.infer<typeof ruleInputSchema>;

const ruleSchema = z
  .object({
    config: ruleConfigSchema,
    description: z.string().optional(),
    id: z.string(),
    kind: z.string(),
    label: z.string(),
    /** The values the rule matches, readable, when it matches against a list. */
    displayValues: z.array(z.string()).readonly().optional(),
    /** Introduces `displayValues` where the condition doesn't. */
    displayValuesLabel: z.string().optional(),
    reads: z.array(ruleInputSchema).readonly(),
    removesSupportLevels: z.array(z.string()).readonly().optional(),
    /** Where the facts the rule checks come from. Backticks mark identifiers. */
    source: z.string().optional(),
    /** The separate conditions behind `condition`, any one of which matches. Backticks mark identifiers. */
    checks: z.array(z.string()).readonly().optional(),
    /** The condition in plain words. */
    condition: z.string(),
  })
  .readonly();

export type RuleDescription = z.infer<typeof ruleSchema>;

/** A step the teacher completes before ORA starts work. */
const accountGateSchema = z
  .object({
    config: ruleConfigSchema,
    description: z.string(),
    id: z.string(),
    label: z.string(),
    status: z.enum(["in-place", "planned"]),
    /** What the teacher sees until the gate is met. */
    untilMet: z.string(),
  })
  .readonly();

export type AccountGate = z.infer<typeof accountGateSchema>;

/** A property of the teacher that changes what ORA allows, with no unmet state. */
const accessPolicySchema = z
  .object({
    config: ruleConfigSchema,
    description: z.string(),
    id: z.string(),
    label: z.string(),
    outcomes: z
      .array(z.object({ label: z.string(), result: z.string() }).readonly())
      .readonly(),
  })
  .readonly();

export type AccessPolicy = z.infer<typeof accessPolicySchema>;

export const ruleCatalogueSchema = z
  .object({
    access: z.array(accessPolicySchema).readonly(),
    capabilities: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string(),
            rules: z.array(ruleSchema).readonly(),
          })
          .readonly(),
      )
      .readonly(),
    gates: z.array(accountGateSchema).readonly(),
    lesson: z.array(ruleSchema).readonly(),
    /** Rules that change the lesson material ORA reads rather than refusing the lesson. */
    lessonMaterials: z
      .array(
        z
          .object({
            config: ruleConfigSchema,
            description: z.string().optional(),
            id: z.string(),
            label: z.string(),
            displayValues: z.array(z.string()).readonly(),
            condition: z.string(),
          })
          .readonly(),
      )
      .readonly(),
    transformations: z
      .array(
        z
          .object({
            capabilityIds: z.array(z.string()).readonly(),
            /** As declared, before any rule removes a support level. */
            inputs: z.array(transformationInputSchema).readonly().optional(),
            kind: z.string(),
            label: z.string(),
            rules: z.array(ruleSchema).readonly(),
            status: transformationStatusSchema,
          })
          .readonly(),
      )
      .readonly(),
  })
  .readonly();

export type RuleCatalogue = z.infer<typeof ruleCatalogueSchema>;

export const eligibilityEvaluationRequestSchema = z.strictObject({
  lesson: z.strictObject(lessonContextSchema.shape),
  /** Absent to evaluate as a signed-out teacher. */
  teacher: z.strictObject({ inCopyrightRegion: z.boolean() }).optional(),
});

export type EligibilityEvaluationRequest = z.infer<
  typeof eligibilityEvaluationRequestSchema
>;

const refusalSchema = z
  .object({
    level: z.enum(["lesson", "capability", "transformation"]),
    reason: z.string(),
    rule: z.string(),
  })
  .readonly();

export type RuleRefusalDescription = z.infer<typeof refusalSchema>;

export const eligibilityEvaluationResponseSchema = z
  .object({
    capabilities: z
      .array(z.object({ id: z.string(), refusal: refusalSchema.nullable() }).readonly())
      .readonly(),
    lesson: refusalSchema.nullable(),
  })
  .readonly();

export type EligibilityEvaluationResponse = z.infer<
  typeof eligibilityEvaluationResponseSchema
>;
