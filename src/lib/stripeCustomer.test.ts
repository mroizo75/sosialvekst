import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { resolveStripeCustomer, type ResolveCustomerInput } from "@/lib/stripeCustomer";

const fakeSupabase = () => {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    from: () => ({
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
  return { supabase: client as unknown as SupabaseClient, updates };
};

const fakeCustomers = (retrieve: () => Promise<unknown>) => ({
  retrieve: vi.fn(retrieve),
  create: vi.fn(async () => ({ id: "cus_new" })),
}) as unknown as ResolveCustomerInput["customers"] & { create: ReturnType<typeof vi.fn> };

describe("Stripe-kunde for kjøp", () => {
  it("bruker lagret kunde når den finnes i aktiv Stripe-konto", async () => {
    const customers = fakeCustomers(async () => ({ id: "cus_old" }));
    const { supabase, updates } = fakeSupabase();

    const id = await resolveStripeCustomer({ customers, supabase, userId: "u1", storedCustomerId: "cus_old" });

    expect(id).toBe("cus_old");
    expect(customers.create).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("lager ny kunde og lagrer den når lagret kunde tilhører en annen konto", async () => {
    const customers = fakeCustomers(async () => {
      throw Object.assign(new Error("No such customer: 'cus_old'"), { code: "resource_missing" });
    });
    const { supabase, updates } = fakeSupabase();

    const id = await resolveStripeCustomer({ customers, supabase, userId: "u1", email: "a@b.no", storedCustomerId: "cus_old" });

    expect(id).toBe("cus_new");
    expect(customers.create).toHaveBeenCalledWith({ email: "a@b.no", metadata: { userId: "u1" } });
    expect(updates[0]).toMatchObject({ stripe_customer_id: "cus_new" });
  });

  it("stopper ved andre Stripe-feil enn manglende kunde", async () => {
    const customers = fakeCustomers(async () => {
      throw Object.assign(new Error("Invalid API Key"), { code: "api_key_invalid" });
    });
    const { supabase } = fakeSupabase();

    await expect(resolveStripeCustomer({ customers, supabase, userId: "u1", storedCustomerId: "cus_old" })).rejects.toThrow("Invalid API Key");
  });
});
