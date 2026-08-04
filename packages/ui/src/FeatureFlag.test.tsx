import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeatureFlag } from "./FeatureFlag.js";

describe("FeatureFlag", () => {
  it("renders children when the requested flag is enabled", () => {
    const html = renderToStaticMarkup(
      <FeatureFlag
        flag="feature-flags-smoke-test-enabled"
        enabledFlags={["feature-flags-smoke-test-enabled"]}
      >
        <span>enabled</span>
      </FeatureFlag>,
    );

    expect(html).toBe("<span>enabled</span>");
  });

  it("renders nothing when enabled flags are not provided", () => {
    const html = renderToStaticMarkup(
      <FeatureFlag flag="feature-flags-smoke-test-enabled">
        <span>hidden</span>
      </FeatureFlag>,
    );

    expect(html).toBe("");
  });

  it("renders nothing when the requested flag is not enabled", () => {
    const html = renderToStaticMarkup(
      <FeatureFlag flag="feature-flags-smoke-test-enabled" enabledFlags={[]}>
        <span>hidden</span>
      </FeatureFlag>,
    );

    expect(html).toBe("");
  });
});
