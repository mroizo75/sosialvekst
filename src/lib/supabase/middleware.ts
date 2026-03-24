import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getRequiredEnv } from "@/lib/env";

type SessionResult = {
  response: NextResponse;
  isAuthenticated: boolean;
  userId: string | null;
  hasActiveSubscription: boolean;
  hasCompletedOnboarding: boolean;
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

  const { data, error: authError } = await supabase.auth.getUser();
  if (authError?.code === "refresh_token_not_found") {
    await supabase.auth.signOut();
  }
  const userId = data.user?.id ?? null;
  let hasActiveSubscription = false;
  let hasCompletedOnboarding = false;

  if (userId) {
    const activeWorkspaceId = request.cookies.get("active_workspace_id")?.value ?? null;

    let brandQuery = supabase
      .from("brand_profiles")
      .select("target_audience, brand_voice")
      .eq("user_id", userId);
    if (activeWorkspaceId) {
      brandQuery = brandQuery.eq("workspace_id", activeWorkspaceId);
    }

    const [subscriptionResult, brandResult] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      brandQuery.maybeSingle(),
    ]);

    hasActiveSubscription =
      subscriptionResult.data?.status === "active" ||
      subscriptionResult.data?.status === "trialing";

    hasCompletedOnboarding =
      Boolean(brandResult.data?.target_audience) &&
      Boolean(brandResult.data?.brand_voice);
  }

  return {
    response,
    isAuthenticated: Boolean(userId),
    userId,
    hasActiveSubscription,
    hasCompletedOnboarding,
  };
};
