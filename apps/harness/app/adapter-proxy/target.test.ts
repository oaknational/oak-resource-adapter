import { afterEach, describe, expect, it } from "vitest";
import { buildApiTarget } from "./target";

afterEach(() => {
  delete process.env.RESOURCE_ADAPTER_API_ORIGIN;
});

describe("buildApiTarget", () => {
  it("forwards a path and query to the API origin", () => {
    process.env.RESOURCE_ADAPTER_API_ORIGIN = "https://api.example.com";

    expect(buildApiTarget(["trpc", "v1", "capabilities.get"], "?batch=1").href).toBe(
      "https://api.example.com/trpc/v1/capabilities.get?batch=1",
    );
  });

  it("defaults to the local API", () => {
    expect(buildApiTarget(["health"], "").href).toBe("http://localhost:3001/health");
  });

  it("tolerates a trailing slash on the configured origin", () => {
    process.env.RESOURCE_ADAPTER_API_ORIGIN = "https://api.example.com/";

    expect(buildApiTarget(["health"], "").href).toBe("https://api.example.com/health");
  });

  // The proxy sends a protection bypass secret, so a path must never be able to
  // redirect it at another host.
  it.each([
    [["https:", "evil.example.com", "x"]],
    [["http:", "evil.example.com"]],
    [["\\\\", "evil.example.com"]],
    [["..", "..", "etc"]],
  ])("keeps %j on the API origin", (segments) => {
    process.env.RESOURCE_ADAPTER_API_ORIGIN = "https://api.example.com";

    expect(buildApiTarget(segments, "").origin).toBe("https://api.example.com");
  });
});
