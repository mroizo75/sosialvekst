import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { addVideoCredits, consumeVideoCredit, getVideoBalance, paidCreditAmount } from "@/lib/videoCredits";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

type CreditRow = { id: string; user_id: string; workspace_id: string; balance: number; total_purchased: number };

type Store = {
  credits: CreditRow[];
  purchases: string[];
};

const fakeSupabase = (store: Store): SupabaseClient => {
  const table = (name: string) => {
    const filters: Record<string, unknown> = {};
    let pendingUpdate: Partial<CreditRow> | null = null;
    const matches = (row: CreditRow) =>
      Object.entries(filters).every(([column, value]) => row[column as keyof CreditRow] === value);
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
      maybeSingle: async () => ({ data: store.credits.find(matches) ?? null, error: null }),
      insert: async (row: Record<string, unknown>) => {
        if (name === "video_credit_transactions") {
          if (row.type !== "purchase") return { error: null };
          const session = String(row.stripe_session_id);
          if (store.purchases.includes(session)) return { error: { code: "23505", message: "duplicate" } };
          store.purchases.push(session);
          return { error: null };
        }
        store.credits.push({
          id: `c${store.credits.length + 1}`,
          user_id: String(row.user_id),
          workspace_id: String(row.workspace_id),
          balance: Number(row.balance),
          total_purchased: Number(row.total_purchased),
        });
        return { error: null };
      },
      update: (values: Partial<CreditRow>) => {
        pendingUpdate = values;
        return builder;
      },
      then: undefined,
    };
    const originalSelect = builder.select;
    builder.select = () => {
      if (!pendingUpdate) return originalSelect();
      const index = store.credits.findIndex(matches);
      if (index === -1) return Promise.resolve({ data: [], error: null }) as unknown as typeof builder;
      store.credits[index] = { ...store.credits[index], ...pendingUpdate };
      pendingUpdate = null;
      return Promise.resolve({ data: [{ id: store.credits[index].id }], error: null }) as unknown as typeof builder;
    };
    return builder;
  };
  return { from: table } as unknown as SupabaseClient;
};

const kks = { userId: "u1", workspaceId: "w-kks" };
const sydenklar = { userId: "u1", workspaceId: "w-sydenklar" };

describe("videokreditter fra Stripe", () => {
  it("gir bare kreditter for betalte kredittkjøp", () => {
    const metadata = { mode: "video_credits_10", creditAmount: "10" };
    expect(paidCreditAmount({ metadata, paymentStatus: "paid" })).toBe(10);
    expect(paidCreditAmount({ metadata, paymentStatus: "unpaid" })).toBe(0);
    expect(paidCreditAmount({ metadata: { mode: "base" }, paymentStatus: "paid" })).toBe(0);
  });

  it("legger til kreditter én gang selv om webhook og bekreftelse begge kjører", async () => {
    const store: Store = {
      credits: [{ id: "c1", user_id: "u1", workspace_id: "w-kks", balance: 4, total_purchased: 10 }],
      purchases: [],
    };
    const supabase = fakeSupabase(store);

    const first = await addVideoCredits(kks, 10, "cs_1", supabase);
    const second = await addVideoCredits(kks, 10, "cs_1", supabase);

    expect(first).toEqual({ balance: 14, totalPurchased: 20, alreadyCredited: false });
    expect(second.alreadyCredited).toBe(true);
    expect(store.credits[0]?.balance).toBe(14);
  });

  it("holder saldoen adskilt per bedrift", async () => {
    const store: Store = {
      credits: [{ id: "c1", user_id: "u1", workspace_id: "w-kks", balance: 5, total_purchased: 5 }],
      purchases: [],
    };
    const supabase = fakeSupabase(store);

    await addVideoCredits(sydenklar, 30, "cs_2", supabase);
    await consumeVideoCredit(kks, "Reel", supabase);

    expect(await getVideoBalance(kks, supabase)).toEqual({ balance: 4, totalPurchased: 5 });
    expect(await getVideoBalance(sydenklar, supabase)).toEqual({ balance: 30, totalPurchased: 30 });
  });

  it("avviser kjøp uten bedrift", async () => {
    await expect(addVideoCredits({ userId: "u1", workspaceId: "" }, 10, "cs_3", fakeSupabase({ credits: [], purchases: [] })))
      .rejects.toMatchObject({ code: "VIDEO_CREDITS_OWNER_MISSING" });
  });
});
