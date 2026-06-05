import { cookies } from "next/headers";

import { toAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const COOKIE_NAME = "active_workspace_id";

export type Workspace = {
  id: string;
  name: string;
  isDefault: boolean;
};

export const getWorkspaces = async (userId: string): Promise<Workspace[]> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("workspaces")
    .select("id, name, is_default")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    isDefault: row.is_default as boolean,
  }));
};

export const ensureDefaultWorkspace = async (userId: string, name?: string): Promise<string> => {
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("workspaces")
    .select("id")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("workspaces")
    .insert({ user_id: userId, name: name ?? "Min bedrift", is_default: true })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw toAppError("WORKSPACE_CREATE_FAILED", "Kunne ikke opprette standard arbeidsområde");
  }

  return created.id as string;
};

export const createWorkspace = async (userId: string, name: string): Promise<Workspace> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ user_id: userId, name, is_default: false })
    .select("id, name, is_default")
    .single();

  if (error || !data) {
    throw toAppError("WORKSPACE_CREATE_FAILED", "Kunne ikke opprette ny bedrift");
  }

  return { id: data.id as string, name: data.name as string, isDefault: false };
};

export const setActiveWorkspaceId = async (workspaceId: string): Promise<void> => {
  const jar = await cookies();
  jar.set(COOKIE_NAME, workspaceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
};

export const getActiveWorkspaceId = async (): Promise<string | null> => {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value ?? null;
};

export const requireWorkspaceId = async (userId: string): Promise<string> => {
  const cookieId = await getActiveWorkspaceId();

  if (cookieId) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", cookieId)
      .eq("user_id", userId)
      .maybeSingle();

    if (data?.id) return data.id as string;
  }

  const workspaceId = await ensureDefaultWorkspace(userId);
  await setActiveWorkspaceId(workspaceId);
  return workspaceId;
};
