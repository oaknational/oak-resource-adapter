import { afterEach, expect, it, vi } from "vitest";

import { scheduleAt } from "./scheduleAt.js";

afterEach(() => vi.useRealTimers());

it("waits for a 31-day deadline without overflowing the browser timer", () => {
  vi.useFakeTimers();
  const month = 31 * 24 * 60 * 60 * 1000;
  const callback = vi.fn();
  scheduleAt(Date.now() + month, callback);
  vi.advanceTimersByTime(month - 1);
  expect(callback).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(callback).toHaveBeenCalledOnce();
});

it("cancels a deadline after the first timer segment", () => {
  vi.useFakeTimers();
  const callback = vi.fn();
  const cancel = scheduleAt(Date.now() + 31 * 24 * 60 * 60 * 1000, callback);
  vi.advanceTimersByTime(25 * 24 * 60 * 60 * 1000);
  cancel();
  vi.runAllTimers();
  expect(callback).not.toHaveBeenCalled();
});
