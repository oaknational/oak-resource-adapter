import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob, downloadFilename } from "./downloads.js";

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

it.each([
  ['attachment; filename="Worksheet 1.docx"', "Worksheet 1.docx"],
  ["attachment; filename=worksheet.docx", "worksheet.docx"],
  [
    "attachment; filename=worksheet.docx; filename*=UTF-8''Maths%20caf%C3%A9.docx",
    "Maths café.docx",
  ],
  [
    "attachment; filename=worksheet.docx; filename*=UTF-8''bad%ZZ.docx",
    "worksheet.docx",
  ],
  // The shape the API emits for a title the ASCII filename cannot carry.
  [
    "attachment; filename=\"R-sum.docx\"; filename*=UTF-8''R%C3%A9sum%C3%A9.docx",
    "Résumé.docx",
  ],
  ['attachment; filename="../../worksheet.docx"', "resource-document.docx"],
  ['attachment; filename="C:\\worksheet.docx"', "resource-document.docx"],
  ['attachment; filename="worksheet.exe"', "resource-document.docx"],
  ["attachment; filename*=UTF-8''bad%0Aname.docx", "resource-document.docx"],
  ["attachment", "resource-document.docx"],
])("handles Content-Disposition %s", (disposition, filename) => {
  expect(downloadFilename(disposition)).toBe(filename);
});
