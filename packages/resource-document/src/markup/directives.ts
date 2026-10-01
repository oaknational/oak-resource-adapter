import type {
  ResourceDirectiveName,
  ResourceNodeType,
  resourceVocabulary,
} from "../vocabulary.js";
import {
  answerPlacementSchema,
  calloutRoleSchema,
  HEADING_LEVELS,
  responseSpaceKindSchema,
} from "../schema/current.js";
import type { AnswerAnnotation, CalloutNode, ResourceNode } from "../schema/types.js";
import {
  assertAttributes,
  commonAttributeNames,
  commonNodeFields,
  enumAttribute,
  parseBoundedInteger,
  parseExtensions,
  parseInteger,
  parsePositiveInteger,
  requireAttribute,
} from "./attributes.js";
import { invalidMarkup } from "./errors.js";
import { figureAttributeNames, parseFigureAsset, registerAsset } from "./figure.js";
import { nextGeneratedId } from "./generatedIds.js";
import { parseInlineContent } from "./inline.js";
import { tableDirective } from "./table.js";
import type { DirectiveHandler, ParsedDirective, ParserState } from "./types.js";

type DirectiveHandlers = {
  [
    Type in ResourceNodeType as (typeof resourceVocabulary.nodes)[Type]["directives"][number]
  ]: DirectiveHandler<Extract<ResourceNode, { type: Type }>>;
} & {
  [
    Name in typeof resourceVocabulary.annotations.answer.directive
  ]: DirectiveHandler<undefined>;
};

function hasContent(inner: readonly string[]): boolean {
  return inner.some((line) => line.trim().length > 0);
}

function calloutDirective(
  role: CalloutNode["role"] | undefined,
): DirectiveHandler<CalloutNode> {
  return ({ attributes, inner, name }) => {
    assertAttributes(
      attributes,
      role === undefined ? [...commonAttributeNames, "role"] : commonAttributeNames,
      name,
    );
    return {
      ...commonNodeFields(attributes, name),
      type: "callout",
      role: role ?? enumAttribute(attributes, "role", calloutRoleSchema.options, name),
      content: parseInlineContent(inner.join("\n")),
    };
  };
}

const directiveHandlers: DirectiveHandlers = {
  "oak-table": tableDirective(),
  "oak-ion-table": tableDirective("ions"),
  "oak-rhythm-grid": tableDirective("rhythm"),
  "oak-code-block": ({ attributes, inner, name }) => {
    assertAttributes(attributes, [...commonAttributeNames, "language"], name);
    return {
      ...commonNodeFields(attributes, name),
      type: "codeBlock",
      source: inner.join("\n"),
      ...(attributes.language === undefined ? {} : { language: attributes.language }),
    };
  },
  "oak-answer": (directive, state, parseChildren) => {
    const { attributes, name } = directive;
    assertAttributes(attributes, ["id", "target", "placement", "extensions"], name);
    const extensions = parseExtensions(attributes.extensions, name);
    state.answers.push({
      id: requireAttribute(attributes, "id", name),
      targetId: requireAttribute(attributes, "target", name),
      placement: enumAttribute(
        attributes,
        "placement",
        answerPlacementSchema.options,
        name,
      ),
      content: parseChildren(directive),
      ...(extensions === undefined ? {} : { extensions }),
    } satisfies AnswerAnnotation);
    return undefined;
  },

  "oak-learning-objective": calloutDirective("learning-objective"),
  "oak-instruction": calloutDirective("instruction"),
  "oak-callout": calloutDirective(undefined),

  "oak-section": (directive, state, parseChildren) => {
    const { attributes, name } = directive;
    assertAttributes(attributes, commonAttributeNames, name);
    return {
      ...commonNodeFields(attributes, name),
      type: "section",
      children: parseChildren(directive),
    };
  },

  "oak-question": (directive, state, parseChildren) => {
    const { attributes, name } = directive;
    assertAttributes(attributes, [...commonAttributeNames, "number", "marks"], name);
    return {
      ...commonNodeFields(attributes, name),
      type: "question",
      ...(attributes.number === undefined ? {} : { label: attributes.number }),
      ...(attributes.marks === undefined
        ? {}
        : { marks: parseInteger(attributes.marks, `${name} marks`) }),
      children: parseChildren(directive),
    };
  },

  "oak-answer-space": ({ attributes, inner, name }) => {
    assertAttributes(attributes, [...commonAttributeNames, "kind", "lines"], name);
    if (hasContent(inner)) {
      throw invalidMarkup("oak-answer-space cannot contain child content.");
    }
    return {
      ...commonNodeFields(attributes, name),
      type: "responseSpace",
      kind: enumAttribute(attributes, "kind", responseSpaceKindSchema.options, name),
      ...(attributes.lines === undefined
        ? {}
        : { lines: parsePositiveInteger(attributes.lines, `${name} lines`) }),
    };
  },

  "oak-heading": ({ attributes, inner, name }) => {
    assertAttributes(attributes, [...commonAttributeNames, "level"], name);
    return {
      ...commonNodeFields(attributes, name),
      type: "heading",
      level: parseBoundedInteger(
        requireAttribute(attributes, "level", name),
        `${name} level`,
        HEADING_LEVELS,
      ),
      content: parseInlineContent(inner.join("\n")),
    };
  },

  "oak-paragraph": ({ attributes, inner, name }) => {
    assertAttributes(attributes, commonAttributeNames, name);
    return {
      ...commonNodeFields(attributes, name),
      type: "paragraph",
      content: parseInlineContent(inner.join("\n")),
    };
  },

  "oak-figure": ({ attributes, inner, name }, state) => {
    assertAttributes(
      attributes,
      [...commonAttributeNames, ...figureAttributeNames],
      name,
    );
    const asset = parseFigureAsset(attributes);
    registerAsset(state, asset);
    return {
      ...commonNodeFields(attributes, name),
      type: "figure",
      assetId: asset.id,
      ...(hasContent(inner) ? { caption: parseInlineContent(inner.join("\n")) } : {}),
    };
  },

  "oak-unsupported": ({ attributes, inner, name }) => {
    assertAttributes(
      attributes,
      [...commonAttributeNames, "description", "format", "accessible-text"],
      name,
    );
    return {
      ...commonNodeFields(attributes, name),
      type: "unsupported",
      description: requireAttribute(attributes, "description", name),
      ...(attributes["accessible-text"] === undefined
        ? {}
        : { accessibleText: attributes["accessible-text"] }),
      original: {
        format: requireAttribute(attributes, "format", name),
        value: inner.join("\n"),
      },
    };
  },
};

function preserveUnknownDirective(
  directive: ParsedDirective,
  state: ParserState,
): ResourceNode {
  const { attributes, name } = directive;
  const id = attributes.id ?? nextGeneratedId(state, `unsupported-${name}`);
  state.diagnostics.push({
    category: "unsupported-markup",
    severity: "warning",
    message: `Unsupported extraction directive ${name} was preserved without interpretation.`,
    nodeId: id,
    fallback: "unsupported-node",
    reviewRequired: true,
  });
  return {
    id,
    type: "unsupported",
    description: `Unsupported extraction directive ${name}`,
    original: { format: "oak-mmd", value: directive.raw },
  };
}

export function directiveToNode(
  directive: ParsedDirective,
  state: ParserState,
  parseChildren: (directive: ParsedDirective) => ResourceNode[],
): ResourceNode | undefined {
  const handler = Object.hasOwn(directiveHandlers, directive.name)
    ? directiveHandlers[directive.name as ResourceDirectiveName]
    : undefined;
  return handler
    ? handler(directive, state, parseChildren)
    : preserveUnknownDirective(directive, state);
}
