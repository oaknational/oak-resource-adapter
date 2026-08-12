export type HasuraConfig = Readonly<{
  apiKey: string;
  endpoint: string;
  timeoutMs?: number;
}>;

export interface HasuraGraphQLRequest {
  query: string;
  variables: Record<string, unknown>;
}

/**
 * Hasura GraphQL client for curriculum resources.
 * Handles authentication, timeouts, and error responses.
 */
export class HasuraClient {
  private config: HasuraConfig;

  constructor(config: HasuraConfig) {
    this.config = config;
  }

  /**
   * Execute a GraphQL query against Hasura.
   * Returns the raw response payload for caller validation.
   */
  async execute(request: HasuraGraphQLRequest): Promise<unknown> {
    const controller = new AbortController();
    const timeoutMs = this.config.timeoutMs ?? 5_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Hasura responded with ${response.status}`);
      }

      const payload = (await response.json()) as unknown;

      // Check for Hasura error response
      if (
        typeof payload === "object" &&
        payload !== null &&
        "errors" in payload &&
        Array.isArray(payload.errors)
      ) {
        const messages = payload.errors
          .map((e: unknown) =>
            typeof e === "object" && e !== null && "message" in e
              ? e.message
              : "Unknown error",
          )
          .join("; ");
        throw new Error(`Hasura error: ${messages}`);
      }

      return payload;
    } finally {
      clearTimeout(timer);
    }
  }
}
