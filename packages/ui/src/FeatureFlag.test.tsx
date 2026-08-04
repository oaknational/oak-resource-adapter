import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeatureFlag } from "./FeatureFlag.js";

describe("FeatureFlag", () => {
  it("renders children when the requested flag is enabled", () => {
    render(
      <FeatureFlag
        flag="feature-flags-smoke-test-enabled"
        enabledFlags={["feature-flags-smoke-test-enabled"]}
      >
        <span>enabled</span>
      </FeatureFlag>,
    );

    expect(screen.getByText("enabled")).toBeInTheDocument();
  });

  it("renders nothing when enabled flags are not provided", () => {
    const { container } = render(
      <FeatureFlag flag="feature-flags-smoke-test-enabled">
        <span>hidden</span>
      </FeatureFlag>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the requested flag is not enabled", () => {
    const { container } = render(
      <FeatureFlag flag="feature-flags-smoke-test-enabled" enabledFlags={[]}>
        <span>hidden</span>
      </FeatureFlag>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
