import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "./download-blob";

const link = { click: vi.fn(), download: "", href: "", remove: vi.fn() };
const append = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("document", {
    body: { append },
    createElement: vi.fn().mockReturnValue(link),
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DOCX blob download", () => {
  it("starts the download and delays URL cleanup beyond the click", () => {
    const blob = new Blob(["binary"]);

    downloadBlob(blob, "worksheet.docx");

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(append).toHaveBeenCalledWith(link);
    expect(link.href).toBe("blob:download");
    expect(link.download).toBe("worksheet.docx");
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(59_999);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:download");
  });

  it("also cleans up if the download click fails", () => {
    link.click.mockImplementationOnce(() => {
      throw new Error("Download failed");
    });

    expect(() => downloadBlob(new Blob(), "worksheet.docx")).toThrow("Download failed");

    expect(link.remove).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:download");
  });
});
