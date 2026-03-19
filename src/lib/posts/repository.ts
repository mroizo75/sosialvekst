import { toAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MediaMode, PostDraft, SocialChannel, TopicWindow } from "@/lib/types";

type DbPostRow = {
  id: string;
  channel: SocialChannel;
  status: PostDraft["status"];
  scheduled_at: string;
  text_content: string;
  image_url: string | null;
  video_url: string | null;
  quality_score: PostDraft["quality"];
};

const normalizeR2Url = (url: string | null): string | undefined => {
  if (!url) return undefined;

  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!publicBase) return url;

  if (url.startsWith(publicBase)) return url;

  const match = url.match(/\/users\/.+$/);
  if (!match) return url;

  return `${publicBase}${match[0]}`;
};

const toPostDraft = (row: DbPostRow): PostDraft => ({
  id: row.id,
  channel: row.channel,
  status: row.status,
  scheduledAt: row.scheduled_at,
  text: row.text_content,
  imageUrl: normalizeR2Url(row.image_url),
  videoUrl: row.video_url ?? undefined,
  quality: row.quality_score,
});

export const createContentPlan = async (input: {
  userId: string;
  postsPerWeek: number;
  totalWeeks: number;
  countryCode: string;
  mediaMode: MediaMode;
  topicWindows: TopicWindow[];
}): Promise<string> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("content_plans")
    .insert({
      user_id: input.userId,
      posts_per_week: input.postsPerWeek,
      total_weeks: input.totalWeeks,
      country_code: input.countryCode,
      media_mode: input.mediaMode,
      topic_windows: input.topicWindows,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw toAppError("PLAN_CREATE_FAILED", "Kunne ikke opprette content plan", error?.message);
  }

  return data.id as string;
};

export const upsertPosts = async (input: {
  userId: string;
  planId: string;
  posts: PostDraft[];
}): Promise<void> => {
  const supabase = await createSupabaseServerClient();
  const rows = input.posts.map((post) => ({
    id: post.id,
    user_id: input.userId,
    plan_id: input.planId,
    channel: post.channel,
    status: post.status,
    scheduled_at: post.scheduledAt,
    text_content: post.text,
    image_url: post.imageUrl ?? null,
    video_url: post.videoUrl ?? null,
    quality_score: post.quality,
  }));

  const { error } = await supabase.from("posts").upsert(rows, { onConflict: "id" });
  if (error) {
    throw toAppError("POSTS_SAVE_FAILED", "Kunne ikke lagre poster", error.message);
  }
};

export const listPosts = async (userId: string): Promise<PostDraft[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, channel, status, scheduled_at, text_content, image_url, video_url, quality_score")
    .eq("user_id", userId)
    .order("scheduled_at", { ascending: true });

  if (error) {
    throw toAppError("POSTS_LIST_FAILED", "Kunne ikke hente poster", error.message);
  }

  return (data ?? []).map((row) => toPostDraft(row as DbPostRow));
};

export const getPostById = async (userId: string, postId: string): Promise<PostDraft | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, channel, status, scheduled_at, text_content, image_url, video_url, quality_score")
    .eq("user_id", userId)
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    throw toAppError("POST_GET_FAILED", "Kunne ikke hente post", error.message);
  }
  if (!data) {
    return null;
  }

  return toPostDraft(data as DbPostRow);
};

export const savePost = async (userId: string, post: PostDraft): Promise<PostDraft> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .update({
      text_content: post.text,
      image_url: post.imageUrl ?? null,
      video_url: post.videoUrl ?? null,
      status: post.status,
      quality_score: post.quality,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", post.id)
    .select("id, channel, status, scheduled_at, text_content, image_url, video_url, quality_score")
    .single();

  if (error) {
    throw toAppError("POST_UPDATE_FAILED", "Kunne ikke oppdatere post", error.message);
  }

  return toPostDraft(data as DbPostRow);
};
