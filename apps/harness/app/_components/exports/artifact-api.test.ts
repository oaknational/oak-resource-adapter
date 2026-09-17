import { afterEach, expect, it, vi } from "vitest";
import { downloadArtifactFile } from "./artifact-api";
import { downloadFilename } from "./export-api";
afterEach(() => vi.unstubAllGlobals());

it("sends the bearer token only in the header and preserves the download", async () => {
  const bytes = new Uint8Array([80, 75, 0, 255]);
  const fetch = vi.fn().mockResolvedValue(
    new Response(bytes, {
      headers: {
        "Content-Disposition": "attachment; filename*=UTF-8''Fran%C3%A7ais.docx",
      },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const result = await downloadArtifactFile(
    "artifact-id",
    "test-token",
    controller.signal,
  );
  expect(fetch).toHaveBeenCalledWith("/adapter-proxy/resource-artifacts/artifact-id", {
    headers: { Authorization: "Bearer test-token" },
    cache: "no-store",
    signal: controller.signal,
  });
  expect(result.filename).toBe("Français.docx");
  expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes);
});

it.each([
  [401, "Sign in again"],
  [404, "not available"],
  [503, "Try again"],
])("explains HTTP %s", async (status, message) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: Number(status) })),
  );
  await expect(downloadArtifactFile("id", "token")).rejects.toThrow(String(message));
});

it.each(["pdf", "pptx"])(
  "supports safe filenames for %s without accepting a different extension",
  (format) => {
    expect(downloadFilename(`attachment; filename="worksheet.${format}"`, format)).toBe(
      `worksheet.${format}`,
    );
    expect(downloadFilename('attachment; filename="worksheet.exe"', format)).toBe(
      `resource-document.${format}`,
    );
    expect(
      downloadFilename(`attachment; filename="../../worksheet.${format}"`, format),
    ).toBe(`resource-document.${format}`);
  },
);
