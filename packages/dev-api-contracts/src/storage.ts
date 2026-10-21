import { z } from "zod";

const artifactEnvironmentSchema = z.enum(["local", "preview", "staging", "production"]);

/** A failed round trip still answers 200. */
export const storageRoundTripResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      bucket: z.string(),
      byteSize: z.number(),
      crc32c: z.string(),
      environment: artifactEnvironmentSchema,
      federated: z.boolean(),
      key: z.string(),
      status: z.literal("ok"),
    })
    .readonly(),
  z
    .object({
      bucket: z.string().optional(),
      cleanupMessage: z.string().optional(),
      environment: artifactEnvironmentSchema,
      federated: z.boolean().optional(),
      key: z.string().optional(),
      message: z.string(),
      status: z.literal("failed"),
    })
    .readonly(),
]);

export type StorageRoundTripResponse = z.infer<typeof storageRoundTripResponseSchema>;

export type StorageRoundTripSuccess = Extract<
  StorageRoundTripResponse,
  { status: "ok" }
>;

export type StorageRoundTripFailure = Extract<
  StorageRoundTripResponse,
  { status: "failed" }
>;

export const artifactDownloadFixtureSchema = z
  .object({
    artifactId: z.string().nullable(),
    environment: z.enum(["local", "preview", "staging"]),
    ready: z.boolean(),
    stored: z.boolean(),
  })
  .readonly();

export type ArtifactDownloadFixture = z.infer<typeof artifactDownloadFixtureSchema>;
