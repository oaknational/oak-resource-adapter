import { posix } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { generateDocx } from "./docx";
import {
  attributes,
  enabled,
  find,
  imageDocument,
  inline,
  mediaFiles,
  one,
  paragraphStyle,
  png,
  setupDocxTests,
  text,
  unpack,
} from "./docx.test-support";
import type { ImageLoader } from "./images";

setupDocxTests();

describe("DOCX embedded figures", () => {
  it.each([true, false])(
    "formats caption and credit as a compact figure group (embedded=%s)",
    async (embedded) => {
      const imageLoader = vi
        .fn<ImageLoader>()
        .mockResolvedValue({ data: png, type: "png", width: 1, height: 1 });
      const { paragraphs, part } = unpack(
        await generateDocx(imageDocument(), { embedFigures: embedded, imageLoader }),
      );
      expect(paragraphs.map(paragraphStyle)).toEqual([
        embedded ? "Normal" : "MissingImage",
        "Caption",
        "ImageCredit",
      ]);
      expect(attributes(one([paragraphs[1]!], "w:spacing"))).toMatchObject({
        "w:before": "40",
        "w:after": "40",
      });
      const styles = find(part("word/styles.xml"), "w:style");
      for (const [id, size, color, italic] of [
        ["Caption", "20", "555555", true],
        ["ImageCredit", "18", "666666", false],
      ] as const) {
        const style = styles.filter((node) => attributes(node)["w:styleId"] === id);
        expect(attributes(one(style, "w:sz"))["w:val"]).toBe(size);
        expect(attributes(one(style, "w:color"))["w:val"]).toBe(color);
        expect(enabled(style, "w:i")).toHaveLength(italic ? 1 : 0);
        expect(enabled(style, "w:b")).toHaveLength(0);
        expect(enabled(style, "w:keepLines")).toHaveLength(1);
      }
    },
  );

  it.each(["full", "half"] as const)(
    "styles a %s-width missing image as a labelled placeholder",
    async (width) => {
      const { paragraphs, part, body, files } = unpack(
        await generateDocx(imageDocument(undefined, width), { embedFigures: false }),
      );
      const placeholder = paragraphs[0]!;
      expect(paragraphStyle(placeholder)).toBe("MissingImage");
      expect(enabled([placeholder], "w:b")).toHaveLength(1);
      expect(enabled([placeholder], "w:keepNext")).toHaveLength(1);
      expect(paragraphStyle(paragraphs[1]!)).toBe("Caption");
      if (width === "half") {
        expect(attributes(one([placeholder], "w:ind"))["w:right"]).toBe("4819");
      } else expect(find([placeholder], "w:ind")).toHaveLength(0);
      const style = find(part("word/styles.xml"), "w:style").filter(
        (node) => attributes(node)["w:styleId"] === "MissingImage",
      );
      expect(style).toHaveLength(1);
      expect(attributes(one(style, "w:shd"))["w:fill"]).toBe("F2F2F2");
      expect(attributes(one(style, "w:jc"))["w:val"]).toBe("center");
      expect(enabled(style, "w:keepLines")).toHaveLength(1);
      for (const edge of ["top", "bottom", "left", "right"]) {
        expect(attributes(one(style, `w:${edge}`))).toMatchObject({
          "w:val": "dashed",
          "w:space": "10",
        });
      }
      expect(find(body, "w:drawing")).toHaveLength(0);
      expect(mediaFiles(files)).toEqual([]);
    },
  );

  it("keeps a captionless missing-image description in the placeholder without inventing text", async () => {
    const source = imageDocument({ kind: "missing" });
    const figure = source.content[0]!;
    if (figure.type === "figure") delete figure.caption;
    delete source.assets[0]!.credit;
    const { paragraphs } = unpack(await generateDocx(source, { embedFigures: false }));
    expect(paragraphs.map(text)).toEqual(["Image unavailable in this document"]);
    expect(paragraphStyle(paragraphs[0]!)).toBe("MissingImage");
    expect(enabled(paragraphs, "w:keepNext")).toHaveLength(0);
  });

  it.each([
    {
      width: 1,
      height: 1,
      preferredWidth: "full",
      expectedWidth: 1,
      expectedHeight: 1,
    },
    {
      width: 2000,
      height: 1000,
      preferredWidth: "full",
      expectedWidth: 643,
      expectedHeight: 321,
    },
    {
      width: 2000,
      height: 1000,
      preferredWidth: "half",
      expectedWidth: 321,
      expectedHeight: 161,
    },
    {
      width: 200,
      height: 2000,
      preferredWidth: "full",
      expectedWidth: 60,
      expectedHeight: 600,
    },
  ] as const)(
    "embeds PNG bytes and accessible relationships at $expectedWidth × $expectedHeight pixels",
    async ({ width, height, preferredWidth, expectedWidth, expectedHeight }) => {
      const document = imageDocument(undefined, preferredWidth);
      const before = structuredClone(document);
      const imageLoader = vi
        .fn<ImageLoader>()
        .mockResolvedValue({ data: png, type: "png", width, height });
      const { files, part, body, paragraphs } = unpack(
        await generateDocx(document, { imageLoader }),
      );
      expect(imageLoader).toHaveBeenCalledExactlyOnceWith(document.assets[0]);
      const media = mediaFiles(files);
      expect(media).toHaveLength(1);
      expect(files[media[0]!]).toEqual(png);
      const embed = attributes(one(body, "a:blip"))["r:embed"];
      expect(embed).toBeTruthy();
      const relationships = find(
        part("word/_rels/document.xml.rels"),
        "Relationship",
      ).filter((node) => attributes(node).Id === embed);
      expect(relationships).toHaveLength(1);
      const relationship = attributes(relationships[0]!);
      expect(relationship.Type).toBe(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
      );
      expect(relationship.TargetMode).not.toBe("External");
      expect(posix.normalize(posix.join("word", relationship.Target!))).toBe(media[0]);
      expect(attributes(one(body, "wp:docPr")).descr).toBe(
        'A scale: x < 4 & "balanced".',
      );
      for (const tag of ["wp:extent", "a:ext"]) {
        expect(attributes(one(body, tag))).toMatchObject({
          cx: String(expectedWidth * 9525),
          cy: String(expectedHeight * 9525),
        });
      }
      expect(paragraphs.map(text)).toEqual([
        "",
        "Figure caption",
        "Credit: Test illustrator",
      ]);
      one([paragraphs[0]!], "w:keepNext");
      expect(paragraphs.slice(1).map(paragraphStyle)).toEqual([
        "Caption",
        "ImageCredit",
      ]);
      const imageTypes = find(part("[Content_Types].xml"), "Default").filter(
        (node) => attributes(node).Extension === "png",
      );
      expect(imageTypes).toHaveLength(1);
      expect(attributes(imageTypes[0]!).ContentType).toBe("image/png");
      expect(document).toEqual(before);
    },
  );

  it("does not load an image without alternative text or invent an alternative from its caption", async () => {
    const imageLoader = vi
      .fn<ImageLoader>()
      .mockResolvedValue({ data: png, type: "png", width: 1, height: 1 });
    const { paragraphs, body, files } = unpack(
      await generateDocx(imageDocument({ kind: "missing" }), { imageLoader }),
    );
    expect(imageLoader).not.toHaveBeenCalled();
    expect(paragraphs.map(text)).toEqual([
      "Image unavailable in this document",
      "Figure caption",
      "Credit: Test illustrator",
    ]);
    expect(find(body, "w:drawing")).toEqual([]);
    expect(mediaFiles(files)).toEqual([]);
  });

  it.each([true, false])(
    "omits decorative images without calling the loader (caption=%s)",
    async (withCaption) => {
      const document = imageDocument({ kind: "decorative" });
      const figure = document.content[0]!;
      if (figure.type === "figure" && !withCaption) delete figure.caption;
      const imageLoader = vi.fn<ImageLoader>();
      const { paragraphs, body, files } = unpack(
        await generateDocx(document, { imageLoader }),
      );
      expect(imageLoader).not.toHaveBeenCalled();
      expect(paragraphs.map(text).filter(Boolean)).toEqual(
        withCaption ? ["Figure caption"] : [],
      );
      if (withCaption) expect(paragraphStyle(paragraphs[0]!)).toBe("Caption");
      expect(find(body, "w:drawing")).toEqual([]);
      expect(mediaFiles(files)).toEqual([]);
    },
  );

  it.each(["rejected", "unavailable", "disabled"] as const)(
    "retains alternative text and caption when the loader is %s",
    async (mode) => {
      const imageLoader = vi.fn<ImageLoader>();
      if (mode === "rejected")
        imageLoader.mockRejectedValue(new Error("Image unavailable"));
      else imageLoader.mockResolvedValue(undefined);
      const document = imageDocument();
      const { paragraphs, body, files } = unpack(
        await generateDocx(document, {
          imageLoader,
          ...(mode === "disabled" ? { embedFigures: false } : {}),
        }),
      );
      expect(imageLoader).toHaveBeenCalledTimes(mode === "disabled" ? 0 : 1);
      expect(paragraphs.map(text)).toEqual([
        'Image unavailable in this document\nA scale: x < 4 & "balanced".',
        "Figure caption",
        "Credit: Test illustrator",
      ]);
      expect(find(body, "w:drawing")).toEqual([]);
      expect(mediaFiles(files)).toEqual([]);
    },
  );

  it("sanitises image alternative text and captions in XML attributes and text", async () => {
    const document = imageDocument({
      kind: "text",
      text: "Alt\u0000\u000b <&> 😀",
      origin: "authored",
    });
    const figure = document.content[0]!;
    if (figure.type === "figure") figure.caption = inline("Caption\u0001 <&>");
    document.assets[0]!.credit = "Artist\u0008 & colleague";
    const imageLoader = vi
      .fn<ImageLoader>()
      .mockResolvedValue({ data: png, type: "png", width: 1, height: 1 });
    const { body, paragraphs } = unpack(await generateDocx(document, { imageLoader }));
    expect(attributes(one(body, "wp:docPr")).descr).toBe("Alt <&> 😀");
    expect(paragraphs.map(text)).toEqual([
      "",
      "Caption <&>",
      "Credit: Artist & colleague",
    ]);
  });
});
