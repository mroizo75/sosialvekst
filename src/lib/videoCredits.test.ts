import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { addVideoCredits, paidCreditAmount } from "@/lib/videoCredits";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

type Store = {
  credits: { id: string; user_id: string; balance: number; total_purchased: number } | null;
  purchases: string[];
};

const fakeSupabase = (store: Store): SupabaseClient => {
  const table = (name: string) => {
    const filters: Record<string, unknown> = {};
    let pendingUpdate: Record<string, unknown> | null = null;
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      limit: async () => ({
        data: store.purchases.includes(String(filters.stripe_session_id)) ? [{ id: "t" }] : [],
        error: null,
      }),
      maybeSingle: async () => ({ data: store.credits, error: null }),
      insert: async (row: Record<string, unknown>) => {
        if (name === "video_credit_transactions") {
          const session = String(row.stripe_session_id);
          if (store.purchases.includes(session)) return { error: { code: "23505", message: "duplicate" } };
          store.purchases.push(session);
          return { error: null };
        }
        store.credits = { id: "c1", user_id: String(row.user_id), balance: Number(row.balance), total_purchased: Number(row.total_purchased) };
        return { error: null };
      },
      update: (values: Record<string, unknown>) => {
        pendingUpdate = values;
        return builder;
      },
      then: undefined,
    };
    const originalSelect = builder.select;
    builder.select = () => {
      if (pendingUpdate && store.credits && store.credits.balance === filters.balance) {
        store.credits = { ...store.credits, ...(pendingUpdate as Partial<NonNullable<Store["credits"]>>) };
        pendingUpdate = null;
        return Promise.resolve({ data: [{ id: "c1" }], error: null }) as unknown as typeof builder;
      }
      if (pendingUpdate) return Promise.resolve({ data: [], error: null }) as unknown as typeof builder;
      return originalSelect();
    };
    return builder;
  };
  return { from: table } as unknown as SupabaseClient;
};

describe("videokreditter fra Stripe", () => {
  it("gir bare kreditter for betalte kredittkjøp", () => {
    const metadata = { mode: "video_credits_10", creditAmount: "10" };
    expect(paidCreditAmount({ metadata, paymentStatus: "paid" })).toBe(10);
    expect(paidCreditAmount({ metadata, paymentStatus: "unpaid" })).toBe(0);
    expect(paidCreditAmount({ metadata: { mode: "base" }, paymentStatus: "paid" })).toBe(0);
  });

  it("legger til kreditter én gang selv om webhook og bekreftelse begge kjører", async () => {
    const store: Store = { credits: { id: "c1", user_id: "u1", balance: 4, total_purchased: 10 }, purchases: [] };
    const supabase = fakeSupabase(store);

    const first = await addVideoCredits("u1", 10, "cs_1", supabase);
    const second = await addVideoCredits("u1", 10, "cs_1", supabase);

    expect(first).toEqual({ balance: 14, totalPurchased: 20, alreadyCredited: false });
    expect(second.alreadyCredited).toBe(true);
    expect(store.credits?.balance).toBe(14);
  });

  it("oppretter saldo for en ny kunde", async () => {
    const store: Store = { credits: null, purchases: [] };

    const result = await addVideoCredits("u2", 30, "cs_2", fakeSupabase(store));

    expect(result).toEqual({ balance: 30, totalPurchased: 30, alreadyCredited: false });
  });
});
