"use client";

import type { ResourceDocument } from "@oaknational/resource-document";
import { parseColor } from "@oaknational/oak-components";
import { styled } from "styled-components";

import {
  ResourceNodeListRenderer,
  type ResourceDocumentDecorations,
} from "./ResourceNodeRenderer.js";

const Document = styled.article`
  background: ${parseColor("bg-primary")};
  color: ${parseColor("text-primary")};
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: clamp(1rem, 4vw, 2rem);

  h3,
  h4,
  h5,
  h6 {
    line-height: 1.2;
    margin: 0.5rem 0 0;
  }
`;

const DiagnosticSummary = styled.aside`
  background: ${parseColor("lemon30")};
  border: 1px solid ${parseColor("border-neutral-stronger")};
  border-radius: 0.5rem;
  color: ${parseColor("text-primary")};
  padding: 0.75rem;
`;

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
    <Document aria-label={accessibleName} lang={document.language}>
      {diagnosticCount > 0 && (
        <DiagnosticSummary role="note">
          Check this preview against the original worksheet: {diagnosticCount}{" "}
          {diagnosticCount === 1 ? "part" : "parts"} could not be read exactly.
        </DiagnosticSummary>
      )}
      <ResourceNodeListRenderer
        assets={document.assets}
        decorations={decorations}
        nodes={document.content}
        parentHeadingLevel={2}
      />
    </Document>
  );
}
