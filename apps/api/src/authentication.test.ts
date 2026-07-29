import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAuthenticator } from "./authentication";
import { clerkClient } from "@clerk/nextjs/server";

vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@clerk/nextjs/server")>();
  return {
    ...original,
    clerkClient: vi.fn(original.clerkClient),
  };
});

function fakeClient(state: {
  isAuthenticated: boolean;
  auth?: { userId?: string; orgId?: string };
}) {
  return {
    authenticateRequest: vi.fn().mockResolvedValue({
      isAuthenticated: state.isAuthenticated,
      toAuth: () => state.auth ?? {},
    }),
  } as unknown as Awaited<ReturnType<typeof clerkClient>>;
}
const request = () => new Request("http://localhost:3000");

describe("requestAuthenticator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the mapped teacher for an authenticated request", async () => {
    vi.mocked(clerkClient).mockResolvedValue(
      fakeClient({
        isAuthenticated: true,
        auth: { userId: "teacher_123", orgId: "org_1" },
      }),
    );

    await expect(requestAuthenticator(request())).resolves.toEqual({
      teacherId: "teacher_123",
      organisationId: "org_1",
    });
  });

  it("maps a missing organisation to null", async () => {
    vi.mocked(clerkClient).mockResolvedValue(
      fakeClient({ isAuthenticated: true, auth: { userId: "teacher_123" } }),
    );

    await expect(requestAuthenticator(request())).resolves.toEqual({
      teacherId: "teacher_123",
      organisationId: null,
    });
  });

  it("returns null when the request is not authenticated", async () => {
    vi.mocked(clerkClient).mockResolvedValue(fakeClient({ isAuthenticated: false }));

    await expect(requestAuthenticator(request())).resolves.toBeNull();
  });

  it("returns null when there is no user ID", async () => {
    vi.mocked(clerkClient).mockResolvedValue(
      fakeClient({ isAuthenticated: true, auth: {} }),
    );

    await expect(requestAuthenticator(request())).resolves.toBeNull();
  });

  it("returns null (fails closed) when Clerk throws", async () => {
    vi.mocked(clerkClient).mockRejectedValue(new Error("Clerk unreachable"));

    await expect(requestAuthenticator(request())).resolves.toBeNull();
  });
});
