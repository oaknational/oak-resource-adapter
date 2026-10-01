import { assetAlternativeOriginSchema } from "../schema/current.js";
import type { Asset } from "../schema/types.js";
import {
  enumAttribute,
  parseExtensions,
  parsePositiveNumber,
  requireAttribute,
} from "./attributes.js";
import { invalidMarkup } from "./errors.js";
import type { ParserState } from "./types.js";

export const figureAttributeNames = [
  "asset-id",
  "media-type",
  "src",
  "width",
  "height",
  "alt-kind",
  "alt",
  "alt-origin",
  "rights",
  "credit",
  "asset-extensions",
] as const;

export function parseFigureAsset(attributes: Record<string, string>): Asset {
  const id = requireAttribute(attributes, "asset-id", "oak-figure");
  const alternativeKind = requireAttribute(attributes, "alt-kind", "oak-figure");
  const alternative: Asset["alternative"] = (() => {
    if (alternativeKind === "text") {
      return {
        kind: "text" as const,
        text: requireAttribute(attributes, "alt", "oak-figure"),
        origin: enumAttribute(
          attributes,
          "alt-origin",
          assetAlternativeOriginSchema.options,
          "oak-figure",
        ),
      };
    }
    if (alternativeKind === "decorative") {
      if (attributes.alt !== undefined || attributes["alt-origin"] !== undefined) {
        throw invalidMarkup(
          `oak-figure with alt-kind=${JSON.stringify(alternativeKind)} must not declare alt or alt-origin.`,
        );
      }
      return { kind: "decorative" };
    }
    if (alternativeKind === "missing") {
      if (attributes.alt !== undefined || attributes["alt-origin"] !== undefined) {
        throw invalidMarkup(
          `oak-figure with alt-kind=${JSON.stringify(alternativeKind)} must not declare alt or alt-origin.`,
        );
      }
      return { kind: "missing" };
    }
    throw invalidMarkup(
      'oak-figure alt-kind must be "text", "decorative" or "missing".',
    );
  })();

  const width = attributes.width;
  const height = attributes.height;
  if ((width === undefined) !== (height === undefined)) {
    throw invalidMarkup("oak-figure must declare width and height together.");
  }

  const extensions = parseExtensions(attributes["asset-extensions"], "oak-figure");
  return {
    id,
    mediaType: requireAttribute(attributes, "media-type", "oak-figure"),
    contentRef: requireAttribute(attributes, "src", "oak-figure"),
    alternative,
    ...(width === undefined || height === undefined
      ? {}
      : {
          dimensions: {
            width: parsePositiveNumber(width, "oak-figure width"),
            height: parsePositiveNumber(height, "oak-figure height"),
          },
        }),
    ...(attributes.rights === undefined ? {} : { rights: attributes.rights }),
    ...(attributes.credit === undefined ? {} : { credit: attributes.credit }),
    ...(extensions === undefined ? {} : { extensions }),
  };
}

export function registerAsset(state: ParserState, asset: Asset): void {
  const existing = state.assets.get(asset.id);
  if (existing && JSON.stringify(existing) !== JSON.stringify(asset)) {
    throw invalidMarkup(
      `Conflicting metadata was declared for asset ${JSON.stringify(asset.id)}.`,
    );
  }
  state.assets.set(asset.id, asset);
}
