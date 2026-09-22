// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { beforeEach, expect, it, vi } from "vitest";
import type { WorksheetDownloadAvailability } from "@oaknational/resource-adapter-contracts/internal";

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
  };
}
function component(options = props()) {
  return (
    <OakThemeProvider theme={oakDefaultTheme}>
      <WorksheetDownload {...options} />
    </OakThemeProvider>
  );
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
  expect(screen.getByRole("button")).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Français.docx"),
  );
  expect(prepareWorksheetExport).toHaveBeenCalledWith(
    expect.objectContaining({
      adaptationId: documentIdentity.adaptationId,
      resourceDocumentId: documentIdentity.resourceDocumentId,
      format: "docx",
    }),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: prepared.artifactId,
      getToken: options.getToken,
      signal: expect.any(AbortSignal),
    }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Your worksheet is ready.");
  expect(screen.getByRole("status")).toHaveTextContent("browser’s downloads");
  expect(screen.getByRole("button", { name: "Download again" })).toBeEnabled();
});

it("retries delivery using the same artifact", async () => {
  fetchMock.mockRejectedValueOnce(new ResourceAdapterApiError("unavailable", 503));
  const options = props();
  render(component(options));
  await userEvent.click(screen.getByRole("button"));
  await userEvent.click(await screen.findByRole("button", { name: "Retry download" }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  expect(prepareWorksheetExport).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]![0].artifactId).toBe(prepared.artifactId);
});

it("retries preparation without replacing the adaptation", async () => {
  vi.mocked(prepareWorksheetExport).mockRejectedValueOnce(new Error("render failed"));
  render(component());
  await userEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("status")).toHaveTextContent("Your changes are saved");
  await userEvent.click(screen.getByRole("button", { name: "Retry download" }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  expect(prepareWorksheetExport).toHaveBeenCalledTimes(2);
});

it.each(["original", "review", "busy", "unavailable"] as const)(
  "explains why %s worksheets cannot download",
  (downloadAvailability) => {
    render(component({ ...props(), availability: downloadAvailability }));
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/.+/);
  },
);

it("refreshes a stale worksheet without replacing the teacher's work", async () => {
  vi.mocked(prepareWorksheetExport).mockRejectedValueOnce(
    new ResourceAdapterApiError("stale", 409),
  );
  const options = props();
  render(component(options));
  await userEvent.click(screen.getByRole("button"));
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
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: "Preparing worksheet…" })).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Preparing");
    const signal = vi.mocked(prepareWorksheetExport).mock.calls[0]![0].signal;
    if (change === "close") view.unmount();
    else view.rerender(component({ ...options, availability: "busy" }));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(prepared));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  },
);

it("explains a size limit without offering a retry that cannot succeed", async () => {
  vi.mocked(prepareWorksheetExport).mockRejectedValueOnce(
    new ResourceAdapterApiError("too large", 413),
  );
  render(component());
  await userEvent.click(screen.getByRole("button"));
  expect(
    await screen.findByRole("button", { name: "Download unavailable" }),
  ).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "too large to download as a Word document",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it("reports a failed refresh while keeping the worksheet available for retry", async () => {
  vi.mocked(prepareWorksheetExport).mockRejectedValueOnce(
    new ResourceAdapterApiError("stale", 409),
  );
  const options = props();
  const failure = new Error("refresh failed");
  options.onRefresh.mockRejectedValueOnce(failure);
  render(component(options));
  await userEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("button", { name: "Retry download" })).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent("couldn’t refresh");
  expect(options.onError).toHaveBeenCalledOnce();
});
