import {
  transformationCatalogueSchema,
  transformationPreviewSchema,
  transformationRunResponseSchema,
  type TransformationCatalogue,
  type TransformationCatalogueItem,
  type TransformationCommand,
} from "@oaknational/resource-adapter-dev-api-contracts";
import type { z } from "zod";

import { adapterProxyPath, readApiResponse } from "../../harness-api";

export function supportLevelInputOf(item: TransformationCatalogueItem | undefined) {
  return item?.inputs?.find(({ id }) => id === "supportLevel");
}

export async function fetchTransformationCatalogue(): Promise<TransformationCatalogue> {
  const response = await fetch(`${adapterProxyPath}/dev/transformations/catalogue`);
  return readApiResponse(
    response,
    transformationCatalogueSchema,
    "a transformation catalogue",
  );
}

async function postTransformation<TSchema extends z.ZodType>(
  action: "preview" | "run",
  command: TransformationCommand,
  schema: TSchema,
  signal?: AbortSignal,
): Promise<z.output<TSchema>> {
  const response = await fetch(`${adapterProxyPath}/dev/transformations/${action}`, {
    body: JSON.stringify(command),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    ...(signal === undefined ? {} : { signal }),
  });
  return readApiResponse(response, schema, `a transformation ${action}`);
}

export function previewTransformation(
  command: TransformationCommand,
  signal?: AbortSignal,
) {
  return postTransformation("preview", command, transformationPreviewSchema, signal);
}

export function runTransformation(
  command: TransformationCommand,
  signal?: AbortSignal,
) {
  return postTransformation("run", command, transformationRunResponseSchema, signal);
}
