// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { beforeEach, expect, it, vi } from "vitest";
import {
  worksheetExportFormats,
  type WorksheetDownloadAvailability,
} from "@oaknational/resource-adapter-contracts/internal";

import { WorksheetDownload } from "./WorksheetDownload.js";
import { prepareWorksheetExport } from "../../worksheetScaffolding.js";
import { fetchResourceArtifact } from "../../client.js";
import { downloadBlob } from "../../downloads.js";
import { ResourceAdapterApiError } from "../../errors.js";

vi.mock("../../client.js", () => ({ fetchResourceArtifact: vi.fn() }));
vi.mock("../../worksheetScaffolding.js", () => ({ prepareWorksheetExport: vi.fn() }));
vi.mock("../../downloads.js", async (original) => ({
  ...(await original<typeof import("../../downloads.js")>()),
  downloadBlob: vi.fn(),
}));

const documentIdentity = {
  adaptationId: "11111111-1111-4111-8111-111111111111",
  resourceDocumentId: "22222222-2222-4222-8222-222222222222",
};
const prepared = {
  artifactId: "33333333-3333-4333-8333-333333333333",
};
const fetchMock = vi.mocked(fetchResourceArtifact);
function props() {
  return {
    apiBaseUrl: "https://adapter.example/api/",
    getToken: vi.fn().mockResolvedValue("token"),
    ...documentIdentity,
    availability: "available" as WorksheetDownloadAvailability,
    onRefresh: vi.fn().mockResolvedValue(undefined),
    onError: vi.fn(),
    track: vi.fn(),
  };
}
function component(options = props()) {
  return (
    <OakThemeProvider theme={oakDefaultTheme}>
      <WorksheetDownload {...options} />
    </OakThemeProvider>
  );
}
const scaffoldedDocx = "Scaffolded_worksheet.docx";
const originalDocx = "Original_worksheet.docx";

async function chooseFromDownloadMenu(name: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: "Download worksheet" }),
  );
  await userEvent.click(await screen.findByRole("menuitem", { name }));
}

function response() {
  return {
    blob: new Blob(["DOCX"]),
    contentDisposition: "attachment; filename*=UTF-8''Fran%C3%A7ais.docx",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset().mockImplementation(async () => response());
  vi.mocked(prepareWorksheetExport).mockReset().mockResolvedValue(prepared);
});

it("prepares the displayed document and downloads with authentication and a safe filename", async () => {
  const options = props();
  render(component(options));
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole("button", { name: "Download worksheet" })).toHaveFocus();
  await user.keyboard("{Enter}");
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitem", { name: scaffoldedDocx })).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Français.docx"),
  );
  expect(prepareWorksheetExport).toHaveBeenCalledWith(
    expect.objectContaining({
      adaptationId: documentIdentity.adaptationId,
      resourceDocumentId: documentIdentity.resourceDocumentId,
      format: "docx",
      variant: "scaffolded",
    }),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: prepared.artifactId,
      getToken: options.getToken,
      signal: expect.any(AbortSignal),
    }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Download generated");
  expect(screen.queryByRole("menu")).toBeNull();
});

it("offers each supported format in labelled scaffolded and original sections", async () => {
  render(component());
  await userEvent.click(screen.getByRole("button", { name: "Download worksheet" }));
  const scaffolded = screen.getByRole("group", { name: "Scaffolded worksheet" });
  const original = screen.getByRole("group", { name: "Original worksheet" });
  expect(
    within(scaffolded)
      .getAllByRole("menuitem")
      .map((item) => item.textContent),
  ).toEqual(worksheetExportFormats.map((format) => `Scaffolded_worksheet.${format}`));
  expect(
    within(original)
      .getAllByRole("menuitem")
      .map((item) => item.textContent),
  ).toEqual(worksheetExportFormats.map((format) => `Original_worksheet.${format}`));
  expect(
    screen.getByRole("menuitem", { name: "About Oak's AI (opens in a new tab)" }),
  ).toHaveAttribute("target", "_blank");
});

it("downloads the original worksheet with its own artifact and success event", async () => {
  const options = props();
  vi.mocked(prepareWorksheetExport).mockImplementation(async ({ variant }) => ({
    artifactId: variant,
  }));
  render(component(options));
  await chooseFromDownloadMenu(originalDocx);
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  expect(prepareWorksheetExport).toHaveBeenLastCalledWith(
    expect.objectContaining({ format: "docx", variant: "original" }),
  );
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ artifactId: "original" }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Download generated");
  expect(options.track.mock.calls).toEqual([
    [
      {
        name: "Original Resource Downloaded",
        adaptationId: documentIdentity.adaptationId,
        componentType: "download_menu_item",
        format: "docx",
      },
    ],
  ]);
  await chooseFromDownloadMenu(scaffoldedDocx);
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(2));
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ artifactId: "scaffolded" }),
  );
});

it("reports each completed download, not a failed attempt", async () => {
  fetchMock.mockRejectedValueOnce(new ResourceAdapterApiError("unavailable", 503));
  const options = props();
  render(component(options));
  await chooseFromDownloadMenu(scaffoldedDocx);
  expect(await screen.findByRole("status")).toHaveTextContent("Try again");
  await chooseFromDownloadMenu(scaffoldedDocx);
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  await chooseFromDownloadMenu(scaffoldedDocx);
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(2));
  expect(options.track.mock.calls.map(([event]) => event.name)).toEqual([
    "Adaptation Request Failed",
    "Adapted Resource Downloaded",
    "Adapted Resource Downloaded",
  ]);
  expect(options.track).toHaveBeenCalledWith({
    adaptationId: documentIdentity.adaptationId,
    componentType: "download_menu_item",
    format: "docx",
    name: "Adapted Resource Downloaded",
  });
});

it("retries delivery using the same artifact", async () => {
  fetchMock.mockRejectedValueOnce(new ResourceAdapterApiError("unavailable", 503));
  render(component());
  await chooseFromDownloadMenu(scaffoldedDocx);
  expect(await screen.findByRole("status")).toHaveTextContent("Try again");
  await chooseFromDownloadMenu(scaffoldedDocx);
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  expect(prepareWorksheetExport).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]![0].artifactId).toBe(prepared.artifactId);
});

it("retries preparation without replacing the adaptation", async () => {
  vi.mocked(prepareWorksheetExport).mockRejectedValueOnce(new Error("render failed"));
  render(component());
  await chooseFromDownloadMenu(scaffoldedDocx);
  expect(await screen.findByRole("status")).toHaveTextContent("Your changes are saved");
  await chooseFromDownloadMenu(scaffoldedDocx);
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  expect(prepareWorksheetExport).toHaveBeenCalledTimes(2);
});

it.each([
  ["original", "Accept scaffolds to access downloads"],
  ["review", "Accept or undo the scaffold under review to access downloads"],
  ["busy", "Wait for the worksheet to finish updating to access downloads"],
  ["unavailable", "This worksheet isn't available to download"],
] as const)(
  "locks %s worksheets and says why in the menu",
  async (availability, reason) => {
    const options = { ...props(), availability };
    render(component(options));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Download worksheet" }));
    expect(screen.queryByRole("group", { name: /worksheet/ })).toBeNull();
    await user.keyboard("{ArrowDown}");
    const locked = screen.getByRole("menuitem", { name: reason });
    expect(locked).toHaveFocus();
    expect(locked).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: "About Oak's AI (opens in a new tab)" }),
    ).toHaveFocus();
    await user.click(locked);
    expect(prepareWorksheetExport).not.toHaveBeenCalled();
  },
);

it("refreshes a stale worksheet without replacing the teacher's work", async () => {
  vi.mocked(prepareWorksheetExport).mockRejectedValueOnce(
    new ResourceAdapterApiError("stale", 409),
  );
  const options = props();
  render(component(options));
  await chooseFromDownloadMenu(scaffoldedDocx);
  await waitFor(() => expect(options.onRefresh).toHaveBeenCalledOnce());
  expect(fetchMock).not.toHaveBeenCalled();
  expect(options.onError).not.toHaveBeenCalled();
});

it.each(["close", "operation"] as const)(
  "aborts preparation and ignores late results on %s",
  async (change) => {
    const pending = Promise.withResolvers<typeof prepared>();
    vi.mocked(prepareWorksheetExport).mockReturnValueOnce(pending.promise);
    const options = props();
    const view = render(component(options));
    await chooseFromDownloadMenu(scaffoldedDocx);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparing an editable Word document with your accepted changes.",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Download worksheet" })).toHaveFocus(),
    );
    const signal = vi.mocked(prepareWorksheetExport).mock.calls[0]![0].signal;
    if (change === "close") view.unmount();
    else view.rerender(component({ ...options, availability: "busy" }));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(prepared));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  },
);

it("words preparation of the original worksheet for the original", async () => {
  vi.mocked(prepareWorksheetExport).mockReturnValueOnce(new Promise(() => {}));
  render(component());
  await chooseFromDownloadMenu(originalDocx);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Preparing an editable Word document of the original worksheet.",
  );
});

it("explains a size limit without offering a retry that cannot succeed", async () => {
  vi.mocked(prepareWorksheetExport).mockRejectedValueOnce(
    new ResourceAdapterApiError("too large", 413),
  );
  render(component());
  await chooseFromDownloadMenu(scaffoldedDocx);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "too large to download as a Word document",
  );
  await userEvent.click(screen.getByRole("button", { name: "Download worksheet" }));
  expect(screen.getByRole("menuitem", { name: scaffoldedDocx })).toBeDisabled();
  expect(screen.getByRole("menuitem", { name: originalDocx })).toBeEnabled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps a too-large file disabled after another file downloads", async () => {
  vi.mocked(prepareWorksheetExport).mockRejectedValueOnce(
    new ResourceAdapterApiError("too large", 413),
  );
  render(component());
  await chooseFromDownloadMenu(scaffoldedDocx);
  expect(await screen.findByRole("status")).toHaveTextContent("too large");
  await chooseFromDownloadMenu(originalDocx);
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  await userEvent.click(screen.getByRole("button", { name: "Download worksheet" }));
  expect(screen.getByRole("menuitem", { name: scaffoldedDocx })).toBeDisabled();
});

it("reports a failed refresh while keeping the worksheet available for retry", async () => {
  vi.mocked(prepareWorksheetExport).mockRejectedValueOnce(
    new ResourceAdapterApiError("stale", 409),
  );
  const options = props();
  const failure = new Error("refresh failed");
  options.onRefresh.mockRejectedValueOnce(failure);
  render(component(options));
  await chooseFromDownloadMenu(scaffoldedDocx);
  expect(await screen.findByRole("status")).toHaveTextContent("couldn’t refresh");
  expect(options.onError).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole("button", { name: "Download worksheet" }));
  expect(screen.getByRole("menuitem", { name: scaffoldedDocx })).toBeEnabled();
});
