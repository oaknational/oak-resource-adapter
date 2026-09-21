import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/oidc", () => ({ getVercelOidcToken: vi.fn() }));

const provider =
  "projects/1/locations/global/workloadIdentityPools/vercel/providers/vercel";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("GOOGLE_CLOUD_PROJECT", "storage-test");
  vi.stubEnv("GCP_WORKLOAD_IDENTITY_PROVIDER", provider);
  vi.stubEnv("GCP_SERVICE_ACCOUNT", "storage@storage-test.iam.gserviceaccount.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getStorage", () => {
  it("lets the SDK cache its auth client and retrieve fresh subject tokens", async () => {
    const { getVercelOidcToken } = await import("@vercel/oidc");
    vi.mocked(getVercelOidcToken)
      .mockResolvedValueOnce("first-request-token")
      .mockResolvedValueOnce("second-request-token");
    const { getStorage, isFederated } = await import("./client.js");

    expect(isFederated()).toBe(true);
    const storage = getStorage();
    const auth = await storage.authClient.getClient();

    expect(getStorage()).toBe(storage);
    expect(await storage.authClient.getClient()).toBe(auth);
    expect(getVercelOidcToken).not.toHaveBeenCalled();
    expect(auth).toMatchObject({
      scopes: expect.arrayContaining([
        "https://www.googleapis.com/auth/cloud-platform",
      ]),
    });
    if (
      !("retrieveSubjectToken" in auth) ||
      typeof auth.retrieveSubjectToken !== "function"
    ) {
      throw new Error("Storage did not construct an external-account client.");
    }
    await expect(auth.retrieveSubjectToken()).resolves.toBe("first-request-token");
    await expect(auth.retrieveSubjectToken()).resolves.toBe("second-request-token");
    expect(getVercelOidcToken).toHaveBeenCalledTimes(2);
  });

  it.each(["GCP_SERVICE_ACCOUNT", "GCP_WORKLOAD_IDENTITY_PROVIDER"])(
    "replaces the cached client when %s changes",
    async (variable) => {
      const { getStorage } = await import("./client.js");
      const original = getStorage();

      vi.stubEnv(variable, `${process.env[variable]}-changed`);
      const replacement = getStorage();

      expect(replacement).not.toBe(original);
      expect(getStorage()).toBe(replacement);
    },
  );

  it("switches to local ADC when federation is removed", async () => {
    const { getStorage, isFederated } = await import("./client.js");
    const federated = getStorage();

    vi.stubEnv("GCP_WORKLOAD_IDENTITY_PROVIDER", "");
    const local = getStorage();

    expect(isFederated()).toBe(false);
    expect(local).not.toBe(federated);
    expect(local.authClient.jsonContent).toBeNull();
    expect(getStorage()).toBe(local);
  });
});
