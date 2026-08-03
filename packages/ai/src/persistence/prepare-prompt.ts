import { getDatabaseClient, promptTemplates } from "@oaknational/resource-adapter-db";
import { eq } from "drizzle-orm";

import {
  renderPromptTemplate,
  type PromptTemplate,
  type PromptVariables,
} from "../prompt-template.js";

const IDENTIFIER_VERSION_CONSTRAINT = "prompt_templates_identifier_version_key";

export type PreparedPrompt = Readonly<{
  promptTemplateId: string;
  text: string;
}>;

/** Drizzle wraps driver errors, so `constraint` sits down the `cause` chain. */
function violatedConstraint(error: unknown): string | undefined {
  let current: unknown = error;

  while (current !== null && typeof current === "object") {
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }

    current = "cause" in current ? current.cause : null;
  }

  return undefined;
}

async function selectIdByHash(hash: string): Promise<string | undefined> {
  const [existing] = await getDatabaseClient()
    .select({ id: promptTemplates.id })
    .from(promptTemplates)
    .where(eq(promptTemplates.hash, hash))
    .limit(1);

  return existing?.id;
}

async function insertTemplate(
  promptTemplate: PromptTemplate,
): Promise<string | undefined> {
  try {
    const [inserted] = await getDatabaseClient()
      .insert(promptTemplates)
      .values({
        gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        hash: promptTemplate.hash,
        identifier: promptTemplate.identifier,
        template: promptTemplate.template,
        version: promptTemplate.version,
      })
      // A concurrent first use returns no row rather than raising, so the loser
      // reads the winner's row below.
      .onConflictDoNothing({ target: promptTemplates.hash })
      .returning({ id: promptTemplates.id });

    return inserted?.id;
  } catch (error) {
    // The hash covers the body, so this constraint can only mean the body
    // changed while the version stayed the same.
    if (violatedConstraint(error) === IDENTIFIER_VERSION_CONSTRAINT) {
      throw new Error(
        `Prompt template "${promptTemplate.identifier}" version ${promptTemplate.version} is already stored with a different body. Bump its version.`,
        { cause: error },
      );
    }

    throw error;
  }
}

/** Registers a template on first use, returning the ID of its immutable row. */
async function registerPromptTemplate(promptTemplate: PromptTemplate): Promise<string> {
  const id =
    (await selectIdByHash(promptTemplate.hash)) ??
    (await insertTemplate(promptTemplate)) ??
    (await selectIdByHash(promptTemplate.hash));

  if (id === undefined) {
    throw new Error(
      `Prompt template "${promptTemplate.identifier}" was neither inserted nor found.`,
    );
  }

  return id;
}

/**
 * Renders a template and registers it, returning the text to send and the ID to
 * record against the invocation.
 *
 * The two are returned together so that a call site cannot send one without
 * recording the other. Use {@link renderPromptTemplate} to render without
 * registering.
 */
export async function preparePrompt<TTemplate extends string>(
  params: Readonly<{
    template: PromptTemplate<TTemplate>;
    variables: PromptVariables<TTemplate>;
  }>,
): Promise<PreparedPrompt> {
  // Rendered first so a diverged call site fails before any write.
  const text = renderPromptTemplate(params.template, params.variables);

  return { promptTemplateId: await registerPromptTemplate(params.template), text };
}
