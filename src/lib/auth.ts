import { toAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const requireUserId = async (): Promise<string> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.id) {
    throw toAppError("UNAUTHORIZED", "Bruker er ikke innlogget", error?.message);
  }

  return data.user.id;
};
