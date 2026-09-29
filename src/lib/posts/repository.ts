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
  image_credit?: string | null;
};

type DbPostMediaRow = {
  post_id: string;
  file_url: string;
  sort_order: number;
  credit?: string | null;
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

const POST_SELECT =
  "id, channel, status, scheduled_at, text_content, image_url, video_url, quality_score";
const POST_SELECT_WITH_CREDIT =
  "id, channel, status, scheduled_at, text_content, image_url, video_url, image_credit, quality_score";
const MEDIA_SELECT = "post_id, file_url, sort_order";
const MEDIA_SELECT_WITH_CREDIT = "post_id, file_url, sort_order, credit";

const missingColumn = (message: string | undefined, column: string): boolean =>
  (message ?? "").toLowerCase().includes(column.toLowerCase());

const toPostDraft = (row: DbPostRow): PostDraft => ({
  id: row.id,
  channel: row.channel,
  status: row.status,
  scheduledAt: row.scheduled_at,
  text: row.text_content,
  imageUrl: normalizeR2Url(row.image_url),
  videoUrl: row.video_url ?? undefined,
  imageCredit: row.image_credit ?? undefined,
  quality: row.quality_score,
});

const attachAdditionalImages = (
  posts: PostDraft[],
  mediaRows: DbPostMediaRow[],
): PostDraft[] => {
  if (posts.length === 0) {
    return posts;
  }
  const mediaByPost = new Map<string, string[]>();
  const creditsByPost = new Map<string, string[]>();
  for (const row of mediaRows) {
    const normalized = normalizeR2Url(row.file_url);
    if (!normalized) continue;
    const existing = mediaByPost.get(row.post_id) ?? [];
    existing.push(normalized);
    mediaByPost.set(row.post_id, existing);
    const credits = creditsByPost.get(row.post_id) ?? [];
    credits.push(row.credit ?? "");
    creditsByPost.set(row.post_id, credits);
  }
  return posts.map((post) => ({
    ...post,
    additionalImageUrls: mediaByPost.get(post.id) ?? [],
    additionalImageCredits: creditsByPost.get(post.id) ?? [],
  }));
};

export const createContentPlan = async (input: {
  userId: string;
  workspaceId: string;
  postsPerWeek: number;
  totalWeeks: number;
  countryCode: string;
  mediaMode: MediaMode;
  topicWindows: TopicWindow[];
  channels?: SocialChannel[];
}): Promise<string> => {
  const supabase = await createSupabaseServerClient();

  const payloadWithChannels = {
    user_id: input.userId,
    workspace_id: input.workspaceId,
    posts_per_week: input.postsPerWeek,
    total_weeks: input.totalWeeks,
    country_code: input.countryCode,
    media_mode: input.mediaMode,
    topic_windows: input.topicWindows,
    channels: input.channels ?? ["facebook", "instagram", "linkedin", "tiktok"],
  };

  let data: { id?: string } | null = null;
  let error: { message?: string } | null = null;

  const withChannels = await supabase
    .from("content_plans")
    .insert(payloadWithChannels)
    .select("id")
    .single();

  data = withChannels.data as { id?: string } | null;
  error = withChannels.error as { message?: string } | null;

  if (error?.message?.toLowerCase().includes("channels")) {
    const fallbackWithoutChannels = await supabase
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
    data = fallbackWithoutChannels.data as { id?: string } | null;
    error = fallbackWithoutChannels.error as { message?: string } | null;
  }

  if (error || !data?.id) {
    throw toAppError("PLAN_CREATE_FAILED", "Kunne ikke opprette content plan", error?.message);
  }

  return data.id as string;
};

export const upsertPosts = async (input: {
  userId: string;
  workspaceId: string;
  planId: string;
  posts: PostDraft[];
}): Promise<void> => {
  const supabase = await createSupabaseServerClient();
  const rows = input.posts.map((post) => ({
    id: post.id,
    user_id: input.userId,
    workspace_id: input.workspaceId,
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

const loadMediaRows = async (
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  postIds: string[],
): Promise<DbPostMediaRow[]> => {
  const withCredit = await supabase
    .from("post_media_assets")
    .select(MEDIA_SELECT_WITH_CREDIT)
    .in("post_id", postIds)
    .order("sort_order", { ascending: true });

  if (!withCredit.error) {
    return (withCredit.data ?? []) as DbPostMediaRow[];
  }
  if (!missingColumn(withCredit.error.message, "credit")) {
    if (!withCredit.error.message.toLowerCase().includes("post_media_assets")) {
      throw toAppError("POST_MEDIA_LIST_FAILED", "Kunne ikke hente postmedier", withCredit.error.message);
    }
    return [];
  }

  const plain = await supabase
    .from("post_media_assets")
    .select(MEDIA_SELECT)
    .in("post_id", postIds)
    .order("sort_order", { ascending: true });

  if (plain.error && !plain.error.message.toLowerCase().includes("post_media_assets")) {
    throw toAppError("POST_MEDIA_LIST_FAILED", "Kunne ikke hente postmedier", plain.error.message);
  }
  return (plain.data ?? []) as DbPostMediaRow[];
};

export const listPosts = async (userId: string, workspaceId?: string): Promise<PostDraft[]> => {
  const supabase = await createSupabaseServerClient();
  const run = (columns: string) => {
    let query = supabase.from("posts").select(columns).eq("user_id", userId);
    if (workspaceId) query = query.eq("workspace_id", workspaceId);
    return query.order("scheduled_at", { ascending: true });
  };

  let { data, error } = await run(POST_SELECT_WITH_CREDIT);
  if (error && missingColumn(error.message, "image_credit")) {
    ({ data, error } = await run(POST_SELECT));
  }

  if (error) {
    throw toAppError("POSTS_LIST_FAILED", "Kunne ikke hente poster", error.message);
  }

  const posts = (data ?? []).map((row) => toPostDraft(row as unknown as DbPostRow));
  if (posts.length === 0) {
    return posts;
  }

  const mediaRows = await loadMediaRows(supabase, posts.map((post) => post.id));
  return attachAdditionalImages(posts, mediaRows);
};

export const getPostById = async (userId: string, postId: string): Promise<PostDraft | null> => {
  const supabase = await createSupabaseServerClient();
  let { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT_WITH_CREDIT)
    .eq("user_id", userId)
    .eq("id", postId)
    .maybeSingle();

  if (error && missingColumn(error.message, "image_credit")) {
    ({ data, error } = await supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("user_id", userId)
      .eq("id", postId)
      .maybeSingle());
  }

  if (error) {
    throw toAppError("POST_GET_FAILED", "Kunne ikke hente post", error.message);
  }
  if (!data) {
    return null;
  }

  const post = toPostDraft(data as unknown as DbPostRow);
  const mediaRows = await loadMediaRows(supabase, [postId]);
  const [withMedia] = attachAdditionalImages([post], mediaRows);
  return withMedia;
};

export const savePost = async (userId: string, post: PostDraft): Promise<PostDraft> => {
  const supabase = await createSupabaseServerClient();
  const payload = {
    scheduled_at: post.scheduledAt,
    text_content: post.text,
    image_url: post.imageUrl ?? null,
    video_url: post.videoUrl ?? null,
    status: post.status,
    quality_score: post.quality,
    updated_at: new Date().toISOString(),
  };
  let { data, error } = await supabase
    .from("posts")
    .update({ ...payload, image_credit: post.imageCredit ?? null })
    .eq("user_id", userId)
    .eq("id", post.id)
    .select(POST_SELECT_WITH_CREDIT)
    .single();

  if (error && missingColumn(error.message, "image_credit")) {
    ({ data, error } = await supabase
      .from("posts")
      .update(payload)
      .eq("user_id", userId)
      .eq("id", post.id)
      .select(POST_SELECT)
      .single());
  }

  if (error) {
    throw toAppError("POST_UPDATE_FAILED", "Kunne ikke oppdatere post", error.message);
  }

  const savedPost = toPostDraft(data as unknown as DbPostRow);
  const mediaRows = await loadMediaRows(supabase, [post.id]);
  const [withMedia] = attachAdditionalImages([savedPost], mediaRows);
  return withMedia;
};

export const setPostAdditionalImages = async (
  userId: string,
  postId: string,
  imageUrls: string[],
  credits?: Array<string | undefined>,
): Promise<void> => {
  const supabase = await createSupabaseServerClient();
  const { data: postRow, error: postError } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (postError || !postRow?.id) {
    throw toAppError("POST_NOT_FOUND", "Fant ikke post for oppdatering av ekstra bilder.", postError?.message);
  }

  const { error: deleteError } = await supabase
    .from("post_media_assets")
    .delete()
    .eq("post_id", postId);

  if (deleteError && !deleteError.message.toLowerCase().includes("post_media_assets")) {
    throw toAppError("POST_MEDIA_DELETE_FAILED", "Kunne ikke oppdatere ekstra bilder.", deleteError.message);
  }

  if (imageUrls.length === 0) {
    return;
  }

  const rows = imageUrls.map((url, index) => ({
    post_id: postId,
    file_url: url,
    sort_order: index,
    credit: credits?.[index]?.trim() || null,
  }));

  let { error: insertError } = await supabase.from("post_media_assets").insert(rows);
  if (insertError && missingColumn(insertError.message, "credit")) {
    ({ error: insertError } = await supabase.from("post_media_assets").insert(
      imageUrls.map((url, index) => ({
        post_id: postId,
        file_url: url,
        sort_order: index,
      })),
    ));
  }

  if (insertError) {
    throw toAppError("POST_MEDIA_SAVE_FAILED", "Kunne ikke lagre ekstra bilder.", insertError.message);
  }
};
