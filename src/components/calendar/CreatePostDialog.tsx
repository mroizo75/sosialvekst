"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import type { PostDraft, SocialChannel } from "@/lib/types";

type CreatePostDialogProps = {
  onClose: () => void;
  onCreated: (post: PostDraft) => void;
};

export const CreatePostDialog = ({ onClose, onCreated }: CreatePostDialogProps) => {
  const [channel, setChannel] = useState<SocialChannel>("facebook");
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("11:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const todayStr = new Date().toISOString().slice(0, 10);

  const handleSubmit = async () => {
    if (!text.trim() || !scheduledDate) {
      setError("Skriv inn tekst og velg dato.");
      return;
    }

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`);
    if (scheduledAt.getTime() <= Date.now()) {
      setError("Tidspunktet må være i fremtiden.");
      return;
    }

    setLoading(true);
    setError("");

    const response = await fetch("/api/posts/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text: text.trim(), imageUrl: imageUrl || undefined, scheduledAt: scheduledAt.toISOString() }),
    });

    if (!response.ok) {
      setError("Kunne ikke opprette post. Prov igjen.");
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
          <h3 className="text-sm font-semibold">Lag egen post</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Lukk
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Kanal</label>
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
              label="Dato"
              type="date"
              min={todayStr}
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
            <Input
              label="Tidspunkt"
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
          </div>

          <Textarea
            label="Posttekst"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Skriv innholdet til posten din her..."
          />

          <Input
            label="Bilde-URL (valgfritt)"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <div className="border-t border-border p-4">
          <Button
            onClick={() => void handleSubmit()}
            disabled={loading || !text.trim() || !scheduledDate}
            className="w-full"
          >
            {loading ? "Oppretter..." : "Opprett post"}
          </Button>
        </div>
      </div>
    </>
  );
};
