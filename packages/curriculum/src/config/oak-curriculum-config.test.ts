import { describe, expect, it } from "vitest";

import { oakCurriculumConfigFromEnv } from "./oak-curriculum-config.js";

const env = {
  CURRICULUM_API_URL: "https://curriculum.example/v1/graphql",
  CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY: "a-key",
};

describe("oakCurriculumConfigFromEnv", () => {
  it("builds configuration from envs", () => {
    expect(oakCurriculumConfigFromEnv(env)).toEqual({
      apiKey: "a-key",
      endpoint: "https://curriculum.example/v1/graphql",
    });
  });

  it.each(["CURRICULUM_API_URL", "CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY"])(
    "names %s when it is missing",
    (missing) => {
      const incomplete = { ...env, [missing]: undefined };

      const error = (() => {
        try {
          oakCurriculumConfigFromEnv(incomplete);
        } catch (thrown) {
          return thrown;
        }
      })();

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(missing);
    },
  );

  it("treats a blank variable as missing rather than configuring a blank key", () => {
    expect(() =>
      oakCurriculumConfigFromEnv({
        ...env,
        CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY: "   ",
      }),
    ).toThrow(Error);
  });

  it("keeps the API key out of the failure it raises", () => {
    const error = (() => {
      try {
        oakCurriculumConfigFromEnv({ ...env, CURRICULUM_API_URL: undefined });
      } catch (thrown) {
        return thrown;
      }
    })();

    expect((error as Error).message).not.toContain("a-key");
  });
});
