// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";

import { useWorksheetScaffoldingPolling } from "./useWorksheetScaffoldingPolling.js";

const fetched = { adaptationId: "adaptation-1" } as WorksheetScaffoldingState;

type Props = Readonly<{ adaptationId: string | null; jobId: string | null }>;

function renderPolling(fetchState = vi.fn(async () => fetched)) {
  const onFetched = vi.fn();
  const onFailed = vi.fn();
  const view = renderHook(
    ({ adaptationId, jobId }: Props) =>
      useWorksheetScaffoldingPolling({
        adaptationId,
        jobId,
        fetchState,
        onFetched,
        onFailed,
      }),
    { initialProps: { adaptationId: "adaptation-1", jobId: "job-1" } as Props },
  );
  return { ...view, fetchState, onFetched, onFailed };
}

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useWorksheetScaffoldingPolling", () => {
  it("polls promptly, backs off, and starts promptly again for a new job", async () => {
    const { fetchState, rerender } = renderPolling();

    await advance(100);
    expect(fetchState).toHaveBeenCalledTimes(1);
    await advance(199);
    expect(fetchState).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchState).toHaveBeenCalledTimes(2);

    rerender({ adaptationId: "adaptation-1", jobId: "job-2" });
    await advance(100);
    expect(fetchState).toHaveBeenCalledTimes(3);
  });

  it("drops a response that lands after polling stops", async () => {
    const pending = Promise.withResolvers<WorksheetScaffoldingState>();
    const { onFetched, rerender } = renderPolling(vi.fn(() => pending.promise));

    await advance(100);
    rerender({ adaptationId: null, jobId: null });
    await act(async () => pending.resolve(fetched));

    expect(onFetched).not.toHaveBeenCalled();
  });

  it("reports a failed poll", async () => {
    const error = new Error("poll failed");
    const { onFailed } = renderPolling(vi.fn(async () => Promise.reject(error)));

    await advance(100);

    expect(onFailed).toHaveBeenCalledWith(error);
  });
});
