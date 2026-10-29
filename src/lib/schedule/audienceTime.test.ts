import { describe, expect, it } from "vitest";

import { postingTimeFor, zonedDateTimeToIso } from "@/lib/schedule/audienceTime";

describe("audienceTime", () => {
  it("gir LinkedIn arbeidstid og Instagram kveld i Norge, uten pålagt minutt", () => {
    expect(postingTimeFor("NO", "linkedin", 0)).toEqual({ hour: 8, minute: 0 });
    expect(postingTimeFor("NO", "instagram", 0)).toEqual({ hour: 19, minute: 0 });
    expect(postingTimeFor("no", "facebook", 1)).toEqual({ hour: 8, minute: 0 });
  });

  it("bruker norsk arbeidstid for Sverige og Danmark, og østkysttid for USA", () => {
    expect(postingTimeFor("SE", "linkedin", 0)).toEqual(postingTimeFor("NO", "linkedin", 0));
    expect(postingTimeFor("DK", "instagram", 0)).toEqual({ hour: 19, minute: 0 });
    expect(postingTimeFor("US", "linkedin", 0)).toEqual({ hour: 9, minute: 0 });
    expect(postingTimeFor("XX", "linkedin", 0)).toEqual({ hour: 8, minute: 0 });
  });

  it("legger klokken 11 norsk sommertid som 09:00 UTC", () => {
    expect(zonedDateTimeToIso({
      timeZone: "Europe/Oslo",
      year: 2026,
      month: 9,
      day: 29,
      hour: 11,
    })).toBe("2026-09-29T09:00:00.000Z");
  });

  it("legger klokken 08:00 norsk vintertid som 07:00 UTC", () => {
    expect(zonedDateTimeToIso({
      timeZone: "Europe/Oslo",
      year: 2026,
      month: 1,
      day: 15,
      hour: 8,
      minute: 0,
    })).toBe("2026-01-15T07:00:00.000Z");
  });
});
