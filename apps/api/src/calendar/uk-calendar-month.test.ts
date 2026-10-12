import { describe, expect, it } from "vitest";

import { ukCalendarMonth } from "./uk-calendar-month";

describe("the UK calendar month", () => {
  it.each([
    [
      "mid-month in summer time",
      "2026-10-12T10:00:00Z",
      "2026-09-30T23:00:00Z",
      "2026-11-01T00:00:00Z",
    ],
    [
      "the last second of a summer month",
      "2026-09-30T22:59:59Z",
      "2026-08-31T23:00:00Z",
      "2026-09-30T23:00:00Z",
    ],
    [
      "the first second of a summer month",
      "2026-09-30T23:00:00Z",
      "2026-09-30T23:00:00Z",
      "2026-11-01T00:00:00Z",
    ],
    [
      "the last second of the year",
      "2026-12-31T23:59:59Z",
      "2026-12-01T00:00:00Z",
      "2027-01-01T00:00:00Z",
    ],
    [
      "the first second of the year",
      "2027-01-01T00:00:00Z",
      "2027-01-01T00:00:00Z",
      "2027-02-01T00:00:00Z",
    ],
    [
      "the month the clocks go forward",
      "2027-03-15T12:00:00Z",
      "2027-03-01T00:00:00Z",
      "2027-03-31T23:00:00Z",
    ],
  ])("starts and resets at UK midnight for %s", (_, now, since, resetsAt) => {
    expect(ukCalendarMonth(new Date(now))).toEqual({
      resetsAt: new Date(resetsAt),
      since: new Date(since),
    });
  });
});
