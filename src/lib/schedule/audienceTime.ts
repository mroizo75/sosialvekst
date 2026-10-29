import type { SocialChannel } from "@/lib/types";

const COUNTRY_TIME_ZONE: Record<string, string> = {
  NO: "Europe/Oslo",
  SE: "Europe/Stockholm",
  DK: "Europe/Copenhagen",
  US: "America/New_York",
};

export type PostingTime = { hour: number; minute: number };

// Local clock time, on the hour. Norway, Sweden and Denmark share the Nordic workday.
// US times are Eastern. The minute the user sets is posted as-is, with no channel offset.
const NORDIC_TIMES: Record<SocialChannel, PostingTime[]> = {
  linkedin: [
    { hour: 8, minute: 0 },
    { hour: 12, minute: 0 },
    { hour: 9, minute: 0 },
  ],
  instagram: [
    { hour: 19, minute: 0 },
    { hour: 15, minute: 0 },
    { hour: 20, minute: 0 },
  ],
  facebook: [
    { hour: 12, minute: 0 },
    { hour: 8, minute: 0 },
    { hour: 18, minute: 0 },
  ],
  tiktok: [
    { hour: 19, minute: 0 },
    { hour: 16, minute: 0 },
    { hour: 20, minute: 0 },
  ],
};

const US_TIMES: Record<SocialChannel, PostingTime[]> = {
  linkedin: [
    { hour: 9, minute: 0 },
    { hour: 12, minute: 0 },
    { hour: 8, minute: 0 },
  ],
  instagram: [
    { hour: 11, minute: 0 },
    { hour: 19, minute: 0 },
    { hour: 13, minute: 0 },
  ],
  facebook: [
    { hour: 9, minute: 0 },
    { hour: 13, minute: 0 },
    { hour: 11, minute: 0 },
  ],
  tiktok: [
    { hour: 19, minute: 0 },
    { hour: 16, minute: 0 },
    { hour: 21, minute: 0 },
  ],
};

const COUNTRY_TIMES: Record<string, Record<SocialChannel, PostingTime[]>> = {
  NO: NORDIC_TIMES,
  SE: NORDIC_TIMES,
  DK: NORDIC_TIMES,
  US: US_TIMES,
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

export const timeZoneForCountry = (countryCode: string): string =>
  COUNTRY_TIME_ZONE[countryCode.toUpperCase()] ?? "Europe/Oslo";

export const postingTimeFor = (countryCode: string, channel: SocialChannel, index: number): PostingTime => {
  const table = COUNTRY_TIMES[countryCode.toUpperCase()] ?? NORDIC_TIMES;
  const times = table[channel];
  return times[index % times.length];
};

const readPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number =>
  Number(parts.find((item) => item.type === type)?.value ?? "0");

export const addCalendarDays = (date: CalendarDate, days: number): CalendarDate => {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

export const calendarDateInTimeZone = (value: Date, timeZone: string): CalendarDate => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return {
    year: readPart(parts, "year"),
    month: readPart(parts, "month"),
    day: readPart(parts, "day"),
  };
};

export const mondayOf = (value: Date, timeZone: string): CalendarDate => {
  const current = calendarDateInTimeZone(value, timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(value);
  const day = WEEKDAY_INDEX[weekday] ?? 1;
  const distance = day === 0 ? -6 : 1 - day;
  return addCalendarDays(current, distance);
};

export const zonedDateTimeToIso = (input: {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
}): string => {
  const minute = input.minute ?? 0;
  const utcGuess = Date.UTC(input.year, input.month - 1, input.day, input.hour, minute, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: input.timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcGuess));
  let hour = readPart(parts, "hour");
  let day = readPart(parts, "day");
  if (hour === 24) {
    hour = 0;
    day += 1;
  }
  const zonedAsUtc = Date.UTC(
    readPart(parts, "year"),
    readPart(parts, "month") - 1,
    day,
    hour,
    readPart(parts, "minute"),
    readPart(parts, "second"),
  );
  const offset = zonedAsUtc - utcGuess;
  return new Date(utcGuess - offset).toISOString();
};

export const scheduleInTimeZone = (input: {
  timeZone: string;
  anchor: Date;
  dayOffset: number;
  hour: number;
  minute?: number;
}): string => {
  const monday = mondayOf(input.anchor, input.timeZone);
  const day = addCalendarDays(monday, input.dayOffset);
  return zonedDateTimeToIso({
    timeZone: input.timeZone,
    year: day.year,
    month: day.month,
    day: day.day,
    hour: input.hour,
    minute: input.minute,
  });
};
