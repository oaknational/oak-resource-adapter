import { parseArgs } from "node:util";
import { crc32, deflateSync } from "node:zlib";
import { Document, ImageRun, Packer, Paragraph } from "docx";
import { and, eq, sql } from "drizzle-orm";
import {
  adaptations,
  createDatabaseClient,
  downloadFixtureDocument,
  downloadFixtureMimeType,
  downloadFixtureTitle,
  insertDownloadFixture,
  resourceArtifacts,
  resourceDocuments,
  transformationAttempts,
  transformations,
} from "@oaknational/resource-adapter-db";
import { loadOriginalResourceDocumentFixture } from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import {
  artifactKey,
  getArtifactMetadata,
  uploadArtifact,
} from "@oaknational/resource-adapter-storage";

const { values } = parseArgs({
  options: {
    environment: { type: "string" },
    teacher: { type: "string" },
  },
});
if (
  !["local", "preview", "staging"].includes(values.environment) ||
  !values.teacher?.startsWith("user_") ||
  !process.env.DATABASE_URL
) {
  throw new Error(
    "Supply --environment local|preview|staging --teacher user_… and DATABASE_URL/RESOURCE_ARTIFACTS_BUCKET. Production is not supported.",
  );
}
const key = artifactKey(values.environment, [
  "_persistent-fixtures",
  "do-not-delete",
  "artifact-download",
  "v1",
  "worksheet.docx",
]);
const database = createDatabaseClient(process.env.DATABASE_URL);
const title = downloadFixtureTitle;
const mimeType = downloadFixtureMimeType;

// Incompressible synthetic RGB images exercise the proxy with a substantial DOCX.
function png(seed) {
  function chunk(type, bytes) {
    const payload = Buffer.concat([Buffer.from(type), bytes]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(payload));
    return Buffer.concat([length, payload, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256, 0);
  header.writeUInt32BE(256, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(256 * (1 + 256 * 3));
  let state = seed;
  for (let row = 0; row < 256; row++) {
    for (let col = 1; col <= 256 * 3; col++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      pixels[row * 769 + col] = state & 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

try {
  const artifact = await database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    const [existing] = await transaction
      .select({ artifact: resourceArtifacts, teacher: adaptations.clerkUserId })
      .from(resourceArtifacts)
      .innerJoin(
        resourceDocuments,
        eq(resourceDocuments.id, resourceArtifacts.resourceDocumentId),
      )
      .innerJoin(
        transformationAttempts,
        eq(transformationAttempts.id, resourceDocuments.transformationAttemptId),
      )
      .innerJoin(
        transformations,
        eq(transformations.id, transformationAttempts.transformationId),
      )
      .innerJoin(adaptations, eq(adaptations.id, transformations.adaptationId))
      .where(
        and(
          eq(resourceArtifacts.storageKey, key),
          eq(resourceDocuments.origin, "generated"),
        ),
      );
    if (existing) {
      if (existing.teacher !== values.teacher)
        throw new Error(
          "Fixture belongs to a different teacher; refusing to reassign it.",
        );
      const metadata = await getArtifactMetadata(key);
      if (
        Number(metadata.size) !== existing.artifact.byteSize ||
        (metadata.md5Hash ?? null) !== existing.artifact.checksum
      )
        throw new Error("Stored fixture metadata does not match its database row.");
      return existing.artifact;
    }
    const images = Array.from({ length: 4 }, (_, i) => png(i + 1));
    const bytes = await Packer.toBuffer(
      new Document({
        title,
        sections: [
          {
            children: [
              new Paragraph(title),
              ...images.map(
                (data, i) =>
                  new Paragraph({
                    children: [
                      new ImageRun({
                        type: "png",
                        data,
                        transformation: { width: 256, height: 256 },
                        altText: {
                          title: `Synthetic test image ${i + 1}`,
                          description:
                            "Generated colour noise for testing file delivery",
                          name: `test-${i + 1}`,
                        },
                      }),
                    ],
                  }),
              ),
            ],
          },
        ],
      }),
    );
    const uploaded = await uploadArtifact({ key, body: bytes, contentType: mimeType });
    const { expectedDocument } = await loadOriginalResourceDocumentFixture(
      "linear-equations-smoke",
    );
    return insertDownloadFixture(transaction, {
      document: downloadFixtureDocument(expectedDocument),
      teacherId: values.teacher,
      key,
      byteSize: bytes.length,
      checksum: uploaded.md5Hash ?? null,
    });
  });
  console.log(
    `Persistent fixture: ${key}\nRESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID=${artifact.id}\nBytes: ${artifact.byteSize}\nExclude this key and its database records from transient cleanup.`,
  );
} finally {
  await database.$client.end();
}
