import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getRequiredEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            logger.error("Kunne ikke lagre auth-cookie", {
              error: error instanceof Error ? error.message : "ukjent",
              count: cookiesToSet.length,
            });
            throw error;
          }
        },
      },
    },
  );
};
