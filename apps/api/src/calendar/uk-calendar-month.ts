const monthPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "numeric",
  timeZone: "Europe/London",
  timeZoneName: "longOffset",
  year: "numeric",
});

function monthAt(instant: number) {
  const parts = monthPartsFormatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const offset = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(part("timeZoneName"));
  if (offset === null) {
    throw new Error(`Unexpected UK timezone offset "${part("timeZoneName")}".`);
  }
  const [, sign, hours = "0", minutes = "0"] = offset;
  const offsetMs =
    (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000;
  return { month: Number(part("month")), offsetMs, year: Number(part("year")) };
}

/** Midnight UK time on the 1st of `month` (1-based; 13 is January of the next year). */
function startOfMonth(year: number, month: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, 1);
  // UK clock changes never fall on the 1st, so UTC midnight has the month's opening offset.
  return new Date(utcMidnight - monthAt(utcMidnight).offsetMs);
}

export type CalendarMonth = Readonly<{ since: Date; resetsAt: Date }>;

export function ukCalendarMonth(now: Date): CalendarMonth {
  const { month, year } = monthAt(now.getTime());
  return {
    resetsAt: startOfMonth(year, month + 1),
    since: startOfMonth(year, month),
  };
}
