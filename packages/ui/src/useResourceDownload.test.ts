// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { useResourceDownload } from "./useResourceDownload.js";
import { fetchResourceArtifact } from "./client.js";
import { downloadBlob } from "./downloads.js";
import { ResourceAdapterApiError } from "./errors.js";

vi.mock("./client.js", () => ({ fetchResourceArtifact: vi.fn() }));
vi.mock("./downloads.js", async (original) => ({
  ...(await original<typeof import("./downloads.js")>()),
  downloadBlob: vi.fn(),
}));

function options() {
  return {
    apiBaseUrl: "https://adapter.example",
    resourceDocumentId: "document-1",
    format: "docx",
    enabled: true,
    getToken: async () => "token",
    prepare: vi
      .fn<(signal: AbortSignal) => Promise<{ artifactId: string }>>()
      .mockResolvedValue({ artifactId: "artifact-1" }),
    onStale: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}
const file = () => ({ blob: new Blob(["file"]), contentDisposition: null });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchResourceArtifact).mockReset().mockResolvedValue(file());
});

it.each([404, 503])(
  "retries HTTP %s with the appropriate preparation policy",
  async (status) => {
    const props = options();
    props.prepare
      .mockResolvedValueOnce({ artifactId: "artifact-1" })
      .mockResolvedValue({ artifactId: "artifact-2" });
    vi.mocked(fetchResourceArtifact).mockRejectedValueOnce(
      new ResourceAdapterApiError("delivery failed", status),
    );
    const { result } = renderHook(() => useResourceDownload(props));
    await act(() => result.current.download());
    expect(result.current.state).toMatchObject({ phase: "error", stage: "delivery" });
    await act(() => result.current.download());
    expect(props.prepare).toHaveBeenCalledTimes(status === 404 ? 2 : 1);
    expect(fetchResourceArtifact).toHaveBeenLastCalledWith(
      expect.objectContaining({
        artifactId: status === 404 ? "artifact-2" : "artifact-1",
      }),
    );
    expect(result.current.state.phase).toBe("done");
  },
);

it.each(["resourceDocumentId", "format", "apiBaseUrl"] as const)(
  "invalidates the prepared artifact when %s changes without remounting",
  async (field) => {
    const props = options();
    const { result, rerender } = renderHook((value) => useResourceDownload(value), {
      initialProps: props,
    });
    await act(() => result.current.download());
    const changed = { ...props, [field]: field === "format" ? "pdf" : "changed" };
    rerender(changed);
    expect(result.current.state.phase).toBe("idle");
    await act(() => result.current.download());
    expect(props.prepare).toHaveBeenCalledTimes(2);
    expect(downloadBlob).toHaveBeenLastCalledWith(
      expect.any(Blob),
      field === "format" ? "resource-document.pdf" : "resource-document.docx",
    );
  },
);

it.each(["preparation", "delivery"] as const)(
  "aborts old %s and ignores its late result after a document change",
  async (stage) => {
    const props = options();
    const preparation = Promise.withResolvers<{ artifactId: string }>();
    const delivery =
      Promise.withResolvers<Awaited<ReturnType<typeof fetchResourceArtifact>>>();
    if (stage === "preparation") props.prepare.mockReturnValueOnce(preparation.promise);
    else vi.mocked(fetchResourceArtifact).mockReturnValueOnce(delivery.promise);
    const { result, rerender } = renderHook((value) => useResourceDownload(value), {
      initialProps: props,
    });
    let oldDownload: Promise<void>;
    await act(async () => {
      oldDownload = result.current.download();
    });
    const signal = props.prepare.mock.calls[0]![0];
    rerender({ ...props, resourceDocumentId: "document-2" });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      preparation.resolve({ artifactId: "old-artifact" });
      delivery.resolve(file());
      await oldDownload;
    });
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe("idle");
    await act(() => result.current.download());
    expect(downloadBlob).toHaveBeenCalledOnce();
  },
);

it("aborts an in-flight file request on unmount and ignores its late result", async () => {
  const pending =
    Promise.withResolvers<Awaited<ReturnType<typeof fetchResourceArtifact>>>();
  vi.mocked(fetchResourceArtifact).mockReturnValueOnce(pending.promise);
  const { result, unmount } = renderHook(() => useResourceDownload(options()));
  let download: Promise<void>;
  await act(async () => {
    download = result.current.download();
  });
  const signal = vi.mocked(fetchResourceArtifact).mock.calls[0]![0].signal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve(file());
    await download;
  });
  expect(downloadBlob).not.toHaveBeenCalled();
});
