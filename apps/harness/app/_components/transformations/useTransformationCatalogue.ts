"use client";

import { useEffect, useRef, useState } from "react";

import { preferredSelection } from "../shared/preferred-selection";
import {
  fetchTransformationCatalogue,
  type OakMaterialSummary,
  type TransformationCatalogueItem,
} from "./transformation-api";

function orderedCatalogue(
  catalogue: readonly TransformationCatalogueItem[],
): readonly TransformationCatalogueItem[] {
  return [...catalogue].sort((left, right) => {
    if (left.status === right.status) {
      return 0;
    }
    return left.status === "active" ? -1 : 1;
  });
}

export function useTransformationCatalogue(initialKind?: string | undefined) {
  const [catalogue, setCatalogue] = useState<readonly TransformationCatalogueItem[]>(
    [],
  );
  const [material, setMaterial] = useState<readonly OakMaterialSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState("");
  // Pinned to the first render: a later prop change must not override a choice
  // the user has since made.
  const requestedKindRef = useRef(initialKind);

  useEffect(() => {
    let cancelled = false;

    fetchTransformationCatalogue()
      .then(({ material: parts, transformations }) => {
        if (cancelled) return;

        const ordered = orderedCatalogue(transformations);
        setCatalogue(ordered);
        setMaterial(parts);
        setSelectedKind((current) =>
          preferredSelection(
            requestedKindRef.current,
            current,
            ordered.map(({ kind }) => kind),
          ),
        );
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "The catalogue could not load.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    catalogue,
    error,
    material,
    selected: catalogue.find(({ kind }) => kind === selectedKind),
    selectedKind,
    selectKind: setSelectedKind,
  } as const;
}
