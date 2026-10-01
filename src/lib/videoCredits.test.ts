import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { consumeVideoCredit } from "@/lib/videoCredits";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

type CreditRow = { id: string; balance: number; total_purchased: number };

// Simulates another request spending a credit between our read and our write on the first attempt.
const fakeCredits = (start: number, concurrentSpendOnFirstWrite = false) => {
  const row: CreditRow = { id: "c1", balance: start, total_purchased: 10 };
  const inserts: unknown[] = [];
  let writes = 0;
  const client = {
    from: (table: string) => {
      if (table === "video_credit_transactions") {
        return { insert: async (values: unknown) => { inserts.push(values); return { error: null }; } };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
        update: (values: { balance: number }) => {
          const filters: Record<string, unknown> = {};
          const node = {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return node;
            },
            select: async () => {
              writes += 1;
              if (concurrentSpendOnFirstWrite && writes === 1) row.balance -= 1;
              if (filters.balance !== row.balance) return { data: [], error: null };
              row.balance = values.balance;
              return { data: [{ id: row.id }], error: null };
            },
          };
          return node;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, row, inserts };
};

describe("trekk av videokreditt", () => {
  it("trekker én kreditt og prøver på nytt når saldoen endret seg underveis", async () => {
    const { client, row, inserts } = fakeCredits(3, true);

    const result = await consumeVideoCredit("u1", "Reel for post p1", client);

    expect(result.balance).toBe(1);
    expect(row.balance).toBe(1);
    expect(inserts).toHaveLength(1);
  });

  it("avviser trekk når saldoen er tom", async () => {
    const { client, inserts } = fakeCredits(0);

    await expect(consumeVideoCredit("u1", "Reel for post p1", client)).rejects.toMatchObject({
      code: "VIDEO_CREDITS_EXHAUSTED",
    });
    expect(inserts).toHaveLength(0);
  });
});
