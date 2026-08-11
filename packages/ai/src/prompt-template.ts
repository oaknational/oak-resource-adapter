import { createHash } from "node:crypto";

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Extracts the placeholder names from a template's literal type. */
type PlaceholderNames<TTemplate extends string> =
  TTemplate extends `${string}{{${infer Name}}}${infer Rest}`
    ? Name | PlaceholderNames<Rest>
    : never;

/** The variables a template needs, derived from its own body. */
export type PromptVariables<TTemplate extends string> = Readonly<
  Record<PlaceholderNames<TTemplate>, string>
>;

export type PromptTemplate<TTemplate extends string = string> = Readonly<{
  hash: string;
  /** The stable logical name, such as "lower-reading-age". */
  identifier: string;
  template: TTemplate;
  version: number;
}>;

export type PromptTemplateDefinition<TTemplate extends string = string> = Readonly<{
  identifier: string;
  template: TTemplate;
  version: number;
}>;

function hashTemplate(definition: PromptTemplateDefinition): string {
  return createHash("sha256")
    .update(`${definition.identifier}\n${definition.version}\n${definition.template}`)
    .digest("hex");
}

function validate(definition: PromptTemplateDefinition): void {
  if (!IDENTIFIER_PATTERN.test(definition.identifier)) {
    throw new Error(
      `Prompt template identifier "${definition.identifier}" must be lowercase and hyphen-separated.`,
    );
  }

  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new RangeError(
      `Prompt template "${definition.identifier}" must have an integer version of at least 1.`,
    );
  }

  if (definition.template.trim() === "") {
    throw new Error(`Prompt template "${definition.identifier}" has an empty body.`);
  }

  const withoutPlaceholders = definition.template.replace(PLACEHOLDER_PATTERN, "");
  if (
    definition.template.includes("{{{") ||
    definition.template.includes("}}}") ||
    withoutPlaceholders.includes("{{") ||
    withoutPlaceholders.includes("}}")
  ) {
    throw new Error(
      `Prompt template "${definition.identifier}" has malformed placeholder syntax. Use {{variableName}}.`,
    );
  }
}

/**
 * Defines a source-controlled prompt template, validating it and computing its
 * content hash at module load.
 */
export function definePromptTemplate<const TTemplate extends string>(
  definition: PromptTemplateDefinition<TTemplate>,
): PromptTemplate<TTemplate> {
  validate(definition);

  return {
    hash: hashTemplate(definition),
    identifier: definition.identifier,
    template: definition.template,
    version: definition.version,
  };
}

/**
 * Substitutes a template's placeholders, throwing on a missing variable and on
 * an unused one.
 */
export function renderPromptTemplate<TTemplate extends string>(
  promptTemplate: PromptTemplate<TTemplate>,
  variables: PromptVariables<TTemplate>,
): string {
  // Widened because the keys are not resolvable while `TTemplate` is generic.
  const supplied = new Map<string, string>(
    Object.entries<string>(variables as Record<string, string>),
  );
  const used = new Set<string>();

  const rendered = promptTemplate.template.replace(
    PLACEHOLDER_PATTERN,
    (_placeholder: string, name: string) => {
      const value = supplied.get(name);

      if (value === undefined) {
        throw new Error(
          `Prompt template "${promptTemplate.identifier}" needs a value for {{${name}}}.`,
        );
      }

      used.add(name);
      return value;
    },
  );

  const unused = [...supplied.keys()].filter((name) => !used.has(name));
  if (unused.length > 0) {
    throw new Error(
      `Prompt template "${promptTemplate.identifier}" has no placeholder for ${unused
        .map((name) => `"${name}"`)
        .join(", ")}.`,
    );
  }

  return rendered;
}
