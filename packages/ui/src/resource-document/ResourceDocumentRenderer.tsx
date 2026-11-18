"use client";

import type { ResourceDocument } from "@oaknational/resource-document";
import { OakBox, OakFlex } from "@oaknational/oak-components";

import {
  ResourceNodeListRenderer,
  type ResourceDocumentDecorations,
} from "./ResourceNodeRenderer.js";

export function ResourceDocumentRenderer({
  decorations,
  document,
  label,
}: Readonly<{
  decorations?: ResourceDocumentDecorations | undefined;
  document: ResourceDocument;
  // Two documents from one lesson can be on the page at once — an original
  // alongside an adapted copy — and both would otherwise take their name from
  // the same title.
  label?: string | undefined;
}>) {
  const accessibleName = label ?? document.metadata.title ?? "Untitled resource";
  const { length: diagnosticCount } = document.diagnostics;

  return (
    <OakFlex
      $background="bg-primary"
      $color="text-primary"
      $flexDirection="column"
      $font="body-2"
      $gap="spacing-24"
      $maxWidth="100%"
      aria-label={accessibleName}
      as="article"
      lang={document.language}
      style={{ overflowWrap: "anywhere" }}
    >
      {diagnosticCount > 0 && (
        <OakBox
          $ba="border-solid-s"
          $background="bg-decorative5-very-subdued"
          $borderColor="border-neutral-stronger"
          $borderRadius="border-radius-m2"
          $color="text-primary"
          $pa="spacing-12"
          as="aside"
          role="note"
        >
          Check this preview against the original worksheet: {diagnosticCount}{" "}
          {diagnosticCount === 1 ? "part" : "parts"} could not be read exactly.
        </OakBox>
      )}
      <ResourceNodeListRenderer
        assets={document.assets}
        decorations={decorations}
        nodes={document.content}
        parentHeadingLevel={2}
      />
    </OakFlex>
  );
}
