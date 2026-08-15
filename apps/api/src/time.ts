export const DEFAULT_TIMEZONE = "Europe/Berlin";

export function dateKey(value: Date, timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(key: string, days: number): string {
  const value = new Date(`${key}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function offsetForDate(key: string, timeZone: string): string {
  const name = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${key}T12:00:00Z`))
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  return name.replace("GMT", "") || "+00:00";
}

export function currentWeek(timeZone = DEFAULT_TIMEZONE, now = new Date()): { weekStart: string; resetsAt: string; dates: string[] } {
  const today = dateKey(now, timeZone);
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, -((day + 6) % 7));
  const resetDate = addDays(monday, 7);
  return {
    weekStart: monday,
    resetsAt: `${resetDate}T00:00:00${offsetForDate(resetDate, timeZone)}`,
    dates: Array.from({ length: 7 }, (_, index) => addDays(monday, index)),
  };
}
