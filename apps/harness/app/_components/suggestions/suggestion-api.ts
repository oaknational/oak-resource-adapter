import {
  suggestionCatalogueSchema,
  suggestionPreviewSchema,
  suggestionRunResponseSchema,
  type SuggestionCatalogue,
  type SuggestionCommand,
} from "@oaknational/resource-adapter-dev-api-contracts";
import type { z } from "zod";

import { adapterProxyPath, readApiResponse } from "../../harness-api";

export async function fetchSuggestionCatalogue(): Promise<SuggestionCatalogue> {
  const response = await fetch(`${adapterProxyPath}/dev/suggestions/catalogue`);
  return readApiResponse(
    response,
    suggestionCatalogueSchema,
    "a suggestion-flow catalogue",
  );
}

async function postSuggestion<TSchema extends z.ZodType>(
  action: "preview" | "run",
  command: SuggestionCommand,
  schema: TSchema,
  signal?: AbortSignal,
): Promise<z.output<TSchema>> {
  const response = await fetch(`${adapterProxyPath}/dev/suggestions/${action}`, {
    body: JSON.stringify(command),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    ...(signal === undefined ? {} : { signal }),
  });
  return readApiResponse(response, schema, `a suggestion ${action}`);
}

export function previewSuggestions(command: SuggestionCommand, signal?: AbortSignal) {
  return postSuggestion("preview", command, suggestionPreviewSchema, signal);
}

export function runSuggestions(command: SuggestionCommand, signal?: AbortSignal) {
  return postSuggestion("run", command, suggestionRunResponseSchema, signal);
}
