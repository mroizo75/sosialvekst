import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

type CustomerApi = Pick<Stripe["customers"], "retrieve" | "create">;

export type ResolveCustomerInput = {
  customers: CustomerApi;
  supabase: SupabaseClient;
  userId: string;
  email?: string;
  storedCustomerId?: string | null;
};

const isMissingCustomer = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === "resource_missing";

const existingCustomerId = async (customers: CustomerApi, customerId: string): Promise<string | null> => {
  try {
    const customer = await customers.retrieve(customerId);
    return "deleted" in customer && customer.deleted ? null : customer.id;
  } catch (error) {
    if (isMissingCustomer(error)) return null;
    throw error;
  }
};

// A stored customer id can belong to another Stripe account or mode (old account, test vs live),
// so it is verified against the active key and replaced when Stripe does not know it.
export const resolveStripeCustomer = async ({
  customers,
  supabase,
  userId,
  email,
  storedCustomerId,
}: ResolveCustomerInput): Promise<string> => {
  if (storedCustomerId) {
    const verified = await existingCustomerId(customers, storedCustomerId);
    if (verified) return verified;
  }

  const customer = await customers.create({ email, metadata: { userId } });

  if (storedCustomerId) {
    const { error } = await supabase
      .from("subscriptions")
      .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) {
      throw toAppError("STRIPE_CUSTOMER_SAVE_FAILED", "Kunne ikke lagre ny Stripe-kunde.", error.message);
    }
    logger.warn("Stripe-kunde fantes ikke i aktiv konto, opprettet ny", { userId, customerId: customer.id });
  }

  return customer.id;
};
