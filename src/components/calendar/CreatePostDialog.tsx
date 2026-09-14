"use client";

import { useState } from "react";

import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import type { PostDraft, SocialChannel } from "@/lib/types";

type CreatePostDialogProps = {
  onClose: () => void;
  onCreated: (post: PostDraft) => void;
};

type Mode = "ai" | "manual";

export const CreatePostDialog = ({ onClose, onCreated }: CreatePostDialogProps) => {
  const { dictionary } = useI18n();
  const cp = dictionary.calendar.createPost;

  const [mode, setMode] = useState<Mode>("ai");
  const [channel, setChannel] = useState<SocialChannel>("facebook");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("11:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const handleSubmit = async () => {
    if (mode === "ai" && !topic.trim()) {
      setError(cp.errorTopic);
      return;
    }
    if (mode === "manual" && !text.trim()) {
      setError(cp.errorText);
      return;
    }
    if (!scheduledDate) {
      setError(cp.errorDate);
      return;
    }

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`);
    if (scheduledAt.getTime() <= Date.now()) {
      setError(cp.errorFuture);
      return;
    }

    setLoading(true);
    setError("");

    const body = mode === "ai"
      ? { channel, scheduledAt: scheduledAt.toISOString(), topic: topic.trim(), useAi: true }
      : { channel, scheduledAt: scheduledAt.toISOString(), text: text.trim(), imageUrl: imageUrl || undefined };

    const response = await fetch("/api/posts/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => null) as { message?: string } | null;
      setError(err?.message ?? cp.errorCreate);
      setLoading(false);
      return;
    }

    const post = (await response.json()) as PostDraft;
    onCreated(post);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        onKeyDown={() => {}}
        role="presentation"
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-lg sm:w-[420px]">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-sm font-semibold">{cp.title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {cp.close}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode("ai")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === "ai"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cp.modeAi}
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === "manual"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cp.modeManual}
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{cp.channel}</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as SocialChannel)}
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={cp.date}
              type="date"
              min={todayStr}
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
            <Input
              label={cp.time}
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
          </div>

          {mode === "ai" ? (
            <Textarea
              label={cp.topicLabel}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={4}
              placeholder={cp.topicPlaceholder}
            />
          ) : (
            <>
              <Textarea
                label={cp.textLabel}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder={cp.textPlaceholder}
              />

              <Input
                label={cp.imageUrlLabel}
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={cp.imageUrlPlaceholder}
              />
            </>
          )}

          {mode === "ai" ? (
            <p className="text-xs text-muted-foreground">
              {cp.aiHint}
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <div className="border-t border-border p-4">
          <Button
            onClick={() => void handleSubmit()}
            disabled={loading || !scheduledDate || (mode === "ai" ? !topic.trim() : !text.trim())}
            className="w-full"
          >
            {loading
              ? mode === "ai"
                ? cp.generating
                : cp.creating
              : mode === "ai"
                ? cp.submitAi
                : cp.submitManual
            }
          </Button>
        </div>
      </div>
    </>
  );
};
