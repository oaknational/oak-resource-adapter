import type { ResolvedOakCurriculumConfig } from "./config.js";
import { CurriculumError } from "./errors.js";
import { fetchWithTimeout } from "./fetch-with-timeout.js";

export type HasuraGraphQLRequest = Readonly<{
  query: string;
  variables: Record<string, unknown>;
}>;

export async function executeHasuraQuery(
  config: ResolvedOakCurriculumConfig,
  request: HasuraGraphQLRequest,
): Promise<unknown> {
  const payload = await fetchWithTimeout(
    config.endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(request),
    },
    config.timeoutMs,
    async (response) => {
      if (!response.ok) {
        throw new CurriculumError(
          `Oak's curriculum endpoint answered ${response.status}`,
          { code: "upstream-unavailable" },
        );
      }

      return (await response.json()) as unknown;
    },
  );

  const errorMessages = graphQLErrorMessages(payload);
  if (errorMessages !== null) {
    throw new CurriculumError(`Oak's curriculum endpoint reported: ${errorMessages}`, {
      code: "upstream-unavailable",
    });
  }

  return payload;
}

/** GraphQL reports query failures in a 200 response rather than a status. */
function graphQLErrorMessages(payload: unknown): string | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("errors" in payload) ||
    !Array.isArray(payload.errors)
  ) {
    return null;
  }

  return payload.errors
    .map((error: unknown) =>
      typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "an unreadable error",
    )
    .join("; ");
}
