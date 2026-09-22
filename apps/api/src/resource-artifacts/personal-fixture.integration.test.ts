import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { personalFixture, personalFixtureKey } from "./personal-fixture";
import { findOwnedArtifact } from "./repository";
const objects = vi.hoisted(
  () => new Map<string, { size: number; contentType: string; md5Hash: string }>(),
);
vi.mock("@oaknational/resource-adapter-storage", async (original) => ({
  ...(await original<typeof import("@oaknational/resource-adapter-storage")>()),
  getArtifactMetadata: vi.fn(async (key: string) => {
    const metadata = objects.get(key);
    if (!metadata) throw Object.assign(new Error("missing"), { code: 404 });
    return metadata;
  }),
  isArtifactNotFound: (error: { code?: number }) => error.code === 404,
  uploadArtifact: vi.fn(
    async ({
      key,
      body,
      contentType,
    }: {
      key: string;
      body: Buffer;
      contentType: string;
    }) => {
      if (objects.has(key)) throw new Error("already exists");
      objects.set(key, { size: body.length, contentType, md5Hash: "test-md5" });
    },
  ),
  deleteArtifact: vi.fn(async (key: string) => objects.delete(key)),
}));
const withDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;
withDatabase("personal download fixtures", () => {
  const owner = `user_${randomUUID().replaceAll("-", "")}`;
  const other = `user_${randomUUID().replaceAll("-", "")}`;
  afterEach(async () => {
    await personalFixture(owner, "DELETE");
    await personalFixture(other, "DELETE");
    await personalFixture(owner, "DELETE", "preview");
    await personalFixture(owner, "DELETE", "staging");
    objects.clear();
  });
  it("creates, reads, restores and deletes only the owner's fixture", async () => {
    expect(await personalFixture(owner, "GET")).toEqual({
      artifactId: null,
      stored: false,
      ready: false,
    });
    const created = await personalFixture(owner, "POST");
    const otherCreated = await personalFixture(other, "POST");
    expect(created.ready).toBe(true);
    expect(await personalFixture(owner, "POST")).toEqual(created);
    expect(await findOwnedArtifact(created.artifactId!, owner)).not.toBeNull();
    expect(await findOwnedArtifact(created.artifactId!, other)).toBeNull();
    objects.delete(personalFixtureKey(owner));
    expect((await personalFixture(owner, "GET")).ready).toBe(false);
    expect(await personalFixture(owner, "POST")).toEqual(created);
    await personalFixture(owner, "DELETE");
    expect(await findOwnedArtifact(created.artifactId!, owner)).toBeNull();
    expect(await personalFixture(other, "GET")).toEqual(otherCreated);
    expect(objects.has(personalFixtureKey(owner))).toBe(false);
    expect(objects.has(personalFixtureKey(other))).toBe(true);
    expect(await personalFixture(owner, "DELETE")).toEqual({
      artifactId: null,
      stored: false,
      ready: false,
    });
  });
  it("recovers an object left after a database reset and serialises creation", async () => {
    objects.set(personalFixtureKey(owner), {
      size: 123,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      md5Hash: "existing",
    });
    expect(await personalFixture(owner, "GET")).toEqual({
      artifactId: null,
      stored: true,
      ready: false,
    });
    const [first, second] = await Promise.all([
      personalFixture(owner, "POST"),
      personalFixture(owner, "POST"),
    ]);
    expect(first).toEqual(second);
    expect(first.ready).toBe(true);
  });
  it("isolates preview and staging fixtures for the same account in a shared database", async () => {
    const preview = await personalFixture(owner, "POST", "preview");
    const staging = await personalFixture(owner, "POST", "staging");
    expect(preview.artifactId).not.toBe(staging.artifactId);
    expect(objects.has(personalFixtureKey(owner, "preview"))).toBe(true);
    expect(objects.has(personalFixtureKey(owner, "staging"))).toBe(true);
    await personalFixture(owner, "DELETE", "preview");
    expect(await personalFixture(owner, "GET", "staging")).toEqual(staging);
    expect(objects.has(personalFixtureKey(owner, "staging"))).toBe(true);
    expect(await findOwnedArtifact(preview.artifactId!, owner)).toBeNull();
    expect(await findOwnedArtifact(staging.artifactId!, owner)).not.toBeNull();
  });
});
