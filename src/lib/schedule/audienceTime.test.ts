import { describe, expect, it } from "vitest";

import { minuteForChannel, zonedDateTimeToIso } from "@/lib/schedule/audienceTime";

describe("audienceTime", () => {
  it("legger klokken 11 norsk sommertid som 09:00 UTC", () => {
    expect(zonedDateTimeToIso({
      timeZone: "Europe/Oslo",
      year: 2026,
      month: 9,
      day: 29,
      hour: 11,
    })).toBe("2026-09-29T09:00:00.000Z");
  });

  it("legger klokken 19 norsk vintertid som 18:00 UTC", () => {
    expect(zonedDateTimeToIso({
      timeZone: "Europe/Oslo",
      year: 2026,
      month: 1,
      day: 15,
      hour: 19,
    })).toBe("2026-01-15T18:00:00.000Z");
  });

  it("legger Instagram et kvarter etter Facebook", () => {
    expect(minuteForChannel("facebook")).toBe(0);
    expect(minuteForChannel("instagram")).toBe(25);
  });
});
