import { describe, expect, it } from "vitest";

import { metricsScopesFor } from "@/lib/metrics/scopes";

describe("metricsScopesFor", () => {
  it("legger til statistikktillatelser for kanaler som er slått på", () => {
    expect(metricsScopesFor("meta", "meta, tiktok")).toContain("instagram_manage_insights");
    expect(metricsScopesFor("tiktok", "meta, tiktok")).toEqual(["video.list"]);
  });

  it("legger ikke til noe når variabelen mangler", () => {
    expect(metricsScopesFor("linkedin", undefined)).toEqual([]);
  });
});
