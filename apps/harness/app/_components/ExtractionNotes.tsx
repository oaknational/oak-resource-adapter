"use client";

import { OakInlineBanner } from "@oaknational/oak-components";

import type { ExtractionDiagnostic } from "../scenario-types";

export function ExtractionNotes({
  diagnostics,
  unsupportedNodeIds,
}: Readonly<{
  diagnostics: readonly ExtractionDiagnostic[];
  unsupportedNodeIds: readonly string[];
}>) {
  if (diagnostics.length === 0) {
    return null;
  }

  const preserved =
    unsupportedNodeIds.length === 0
      ? "none — the markup was recognised but flagged"
      : unsupportedNodeIds.join(", ");

  return (
    <OakInlineBanner
      isOpen
      $mt="spacing-24"
      message={
        <>
          <p>
            The document parsed, but the reader met markup this version does not model.
            Unknown directives are kept as unsupported nodes: <em>{preserved}</em>.
          </p>
          <ul>
            {diagnostics.map((diagnostic) => (
              <li key={`${diagnostic.category}-${diagnostic.nodeId ?? "document"}`}>
                <strong>{diagnostic.category}</strong> ({diagnostic.severity})
                {diagnostic.nodeId === null ? "" : ` at ${diagnostic.nodeId}`}:{" "}
                {diagnostic.message}
              </li>
            ))}
          </ul>
        </>
      }
      title="Markup Warning"
      titleTag="h3"
      type="warning"
      variant="regular"
    />
  );
}
