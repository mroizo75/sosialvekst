import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { planForMode, resolveCheckoutWorkspace } from "@/lib/billing";

const workspaces = [
  { id: "w-default", user_id: "u1", is_default: true },
  { id: "w-second", user_id: "u1", is_default: false },
  { id: "w-other", user_id: "u2", is_default: true },
];

const fakeSupabase = (): SupabaseClient => {
  const filters: Record<string, unknown> = {};
  let sorted = false;
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    order: () => {
      sorted = true;
      return builder;
    },
    limit: () => builder,
    maybeSingle: async () => {
      const rows = workspaces
        .filter((row) => Object.entries(filters).every(([column, value]) => row[column as keyof typeof row] === value))
        .sort((a, b) => (sorted ? Number(b.is_default) - Number(a.is_default) : 0));
      return { data: rows[0] ?? null, error: null };
    },
  };
  return { from: () => builder } as unknown as SupabaseClient;
};

describe("betaling per bedrift", () => {
  it("bruker bedriften fra Stripe-økten når den tilhører brukeren", async () => {
    expect(await resolveCheckoutWorkspace(fakeSupabase(), "u1", { workspaceId: "w-second" })).toBe("w-second");
  });

  it("legger gamle økter uten bedrift på standardbedriften", async () => {
    expect(await resolveCheckoutWorkspace(fakeSupabase(), "u1", { mode: "base" })).toBe("w-default");
  });

  it("avviser en bedrift som tilhører en annen bruker", async () => {
    await expect(resolveCheckoutWorkspace(fakeSupabase(), "u1", { workspaceId: "w-other" }))
      .rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
  });

  it("gir riktig plan for tilleggspakken", () => {
    expect(planForMode("extra_posts")).toEqual({ planCode: "extra_5x4", extraPostsPerWeek: 2 });
    expect(planForMode(undefined)).toEqual({ planCode: "base_3x4", extraPostsPerWeek: 0 });
  });
});
