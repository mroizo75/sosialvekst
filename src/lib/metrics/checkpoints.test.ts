import { describe, expect, it } from "vitest";

import { dueCheckpoints } from "@/lib/metrics/checkpoints";

const HOUR = 60 * 60 * 1000;
const published = new Date("2026-09-01T10:00:00Z");
const after = (hours: number) => new Date(published.getTime() + hours * HOUR);

describe("dueCheckpoints", () => {
  it("henter 24h, 72h og 7d etter tur", () => {
    expect(dueCheckpoints(published, after(25), [])).toEqual(["24h"]);
    expect(dueCheckpoints(published, after(73), ["24h"])).toEqual(["72h"]);
    expect(dueCheckpoints(published, after(169), ["24h", "72h"])).toEqual(["7d"]);
  });

  it("henter ingenting før 24 timer eller når målepunktet finnes", () => {
    expect(dueCheckpoints(published, after(23), [])).toEqual([]);
    expect(dueCheckpoints(published, after(30), ["24h"])).toEqual([]);
  });

  it("henter bare siste nådde målepunkt når et tidligere er gått glipp av", () => {
    expect(dueCheckpoints(published, after(100), [])).toEqual(["72h"]);
  });

  it("stopper etter 8 dager", () => {
    expect(dueCheckpoints(published, after(8 * 24 + 1), [])).toEqual([]);
  });
});
