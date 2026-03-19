import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getRequiredEnv } from "@/lib/env";

type SessionResult = {
  response: NextResponse;
  isAuthenticated: boolean;
  userId: string | null;
  hasActiveSubscription: boolean;
};

export const updateSession = async (request: NextRequest): Promise<SessionResult> => {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  let hasActiveSubscription = false;

  if (userId) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    hasActiveSubscription = subscription?.status === "active" || subscription?.status === "trialing";
  }

  return {
    response,
    isAuthenticated: Boolean(userId),
    userId,
    hasActiveSubscription,
  };
};
