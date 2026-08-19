import {
  definePromptTemplate,
  type PromptTemplateDefinition,
} from "@oaknational/resource-adapter-ai";

import type {
  AnswerAnnotation,
  InlineContent,
  ResourceDocument,
  ResourceNode,
} from "@oaknational/resource-document";

import type { TransformationMaterial } from "./oak-material/material";
import { renderOakMaterial } from "./oak-material/requirements";
import { identityPart } from "./prompt-parts/identity.part";
import { languagePart } from "./prompt-parts/language.part";
import { scaffoldPrinciplesPart } from "./prompt-parts/scaffold-principles.part";
import type { TransformationDefinition, TransformationParams } from "./types";

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

type PlaceholderNames<TTemplate extends string> =
  TTemplate extends `${string}{{${infer TName}}}${infer TRest}`
    ? TName | PlaceholderNames<TRest>
    : never;

export type TransformationPromptVariableName =
  | "block"
  | "document"
  | "identity"
  | "language"
  | "lessonMaterial"
  | "scaffoldPrinciples"
  | "supportLevel";

type OnlySupportedVariables<TTemplate extends string> =
  Exclude<PlaceholderNames<TTemplate>, TransformationPromptVariableName> extends never
    ? unknown
    : never;

/** Defines a transformation prompt and rejects unknown variable names at compile time. */
export function defineTransformationPrompt<const TTemplate extends string>(
  definition: PromptTemplateDefinition<TTemplate> & OnlySupportedVariables<TTemplate>,
) {
  return definePromptTemplate(definition);
}

function inlineText(content: InlineContent | undefined): string {
  return (content ?? [])
    .map((run) => (run.type === "text" ? run.text : `$${run.value}$`))
    .join(" ");
}

function nodeLines(node: ResourceNode, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const header = `${indent}<${node.type} id=${JSON.stringify(node.id)}>`;

  switch (node.type) {
    case "section":
      return [header, ...node.children.flatMap((child) => nodeLines(child, depth + 1))];
    case "question": {
      const label = node.label === undefined ? "" : ` ${node.label}`;
      return [
        `${header}${label}`,
        ...node.children.flatMap((child) => nodeLines(child, depth + 1)),
      ];
    }
    case "heading":
    case "paragraph":
      return [`${header} ${inlineText(node.content)}`];
    case "callout":
      return [`${header} [${node.role}] ${inlineText(node.content)}`];
    case "definitionList":
      return [
        `${header} ${inlineText(node.lead)}`,
        ...node.entries.map(({ definition, example, term }) =>
          [
            `${indent}  - ${inlineText(term)}`,
            definition === undefined ? "" : `: ${inlineText(definition)}`,
            example === undefined ? "" : `; example: ${inlineText(example)}`,
          ].join(""),
        ),
      ];
    case "responseSpace": {
      const lines = node.lines === undefined ? "" : `, ${node.lines} lines`;
      return [`${header} [${node.kind}${lines}]`];
    }
    case "figure": {
      const caption = node.caption === undefined ? "" : ` ${inlineText(node.caption)}`;
      return [`${header} [asset ${node.assetId}]${caption}`];
    }
    case "unsupported":
      return [`${header} ${node.accessibleText ?? node.description}`];
  }
}

function answerLines(answer: AnswerAnnotation): string[] {
  return [
    `<answer target=${JSON.stringify(answer.targetId)} placement=${JSON.stringify(answer.placement)}>`,
    ...answer.content.flatMap((node) => nodeLines(node, 1)),
  ];
}

/** Stable pupil- and teacher-readable prompt input, independent of document JSON. */
export function serialiseResourceDocumentForPrompt(document: ResourceDocument): string {
  const { metadata } = document;
  const title = "title" in metadata ? metadata.title : undefined;
  const lines = [
    `Profile: ${document.profile}`,
    `Language: ${document.language}`,
    ...(title === undefined ? [] : [`Title: ${title}`]),
    "",
    "PUPIL RESOURCE",
    ...document.content.flatMap((node) => nodeLines(node, 0)),
  ];

  if (document.answers.length > 0) {
    lines.push("", "TEACHER ANSWERS", ...document.answers.flatMap(answerLines));
  }

  return lines.join("\n");
}

export function serialiseResourceNodeForPrompt(node: ResourceNode): string {
  return nodeLines(node, 0).join("\n");
}

export function transformationPromptVariables(
  definition: TransformationDefinition,
  document: ResourceDocument,
  material: TransformationMaterial,
  params: TransformationParams,
  targetNode: ResourceNode | undefined,
  template: string,
): Record<string, string> {
  const supportLevel = params["supportLevel"];
  const { metadata } = document;
  const available: Readonly<
    Record<TransformationPromptVariableName, string | undefined>
  > = {
    block:
      targetNode === undefined ? undefined : serialiseResourceNodeForPrompt(targetNode),
    document: serialiseResourceDocumentForPrompt(document),
    identity: identityPart(),
    language: languagePart({
      keyStage: "keyStage" in metadata ? metadata.keyStage?.label : undefined,
      targetReadingAge:
        "targetReadingAge" in metadata ? metadata.targetReadingAge : undefined,
      yearGroup: "yearGroup" in metadata ? metadata.yearGroup?.label : undefined,
    }),
    lessonMaterial:
      (definition.materialRequirements ?? []).length === 0
        ? undefined
        : renderOakMaterial(definition.materialRequirements ?? [], material),
    scaffoldPrinciples: scaffoldPrinciplesPart(),
    supportLevel: typeof supportLevel === "string" ? supportLevel : undefined,
  };

  return Object.fromEntries(
    [...template.matchAll(PLACEHOLDER_PATTERN)].map(([, rawName = ""]) => {
      const name = rawName as TransformationPromptVariableName;
      const value = available[name];
      if (value === undefined) {
        throw new Error(
          `${definition.kind} asks for {{${name}}}, which this request does not carry.`,
        );
      }
      return [name, value];
    }),
  );
}
