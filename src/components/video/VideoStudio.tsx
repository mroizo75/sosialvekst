"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type VideoBalance = {
  balance: number;
  totalPurchased: number;
};

type GenerationState = "idle" | "generating" | "done" | "error";
type VideoModel = "veo3" | "kling";
type VideoType = "product" | "intro" | "service" | "event" | "testimonial";

const MODEL_CONFIGS = [
  {
    id: "veo3" as const,
    badge: "Google Veo 3",
    durations: [4, 6, 8] as number[],
    defaultDuration: 8,
    needsImage: false,
    aspects: ["16:9", "9:16"] as string[],
  },
  {
    id: "kling" as const,
    badge: "Kling v3 Pro",
    durations: [5, 10] as number[],
    defaultDuration: 5,
    needsImage: true,
    aspects: ["16:9", "9:16", "1:1"] as string[],
  },
] as const;

const VIDEO_TYPE_IDS: { id: VideoType; icon: string }[] = [
  { id: "product", icon: "📦" },
  { id: "intro", icon: "🏢" },
  { id: "service", icon: "⚡" },
  { id: "event", icon: "🎯" },
  { id: "testimonial", icon: "💬" },
];

const CREDIT_PACK_MODES = [
  "video_credits_10",
  "video_credits_30",
  "video_credits_100",
] as const;

export const VideoStudio = () => {
  const { dictionary } = useI18n();
  const vs = dictionary.videoStudio;

  const ASPECT_LABELS: Record<string, string> = useMemo(() => ({
    "16:9": vs.aspectLandscape,
    "9:16": vs.aspectPortrait,
    "1:1": vs.aspectSquare,
  }), [vs.aspectLandscape, vs.aspectPortrait, vs.aspectSquare]);

  const [balance, setBalance] = useState<VideoBalance | null>(null);
  const [model, setModel] = useState<VideoModel>("veo3");
  const [videoType, setVideoType] = useState<VideoType>("intro");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(8);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [generateAudio, setGenerateAudio] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [state, setState] = useState<GenerationState>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [enrichedPrompt, setEnrichedPrompt] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressDetail, setProgressDetail] = useState("");
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const activeModel = MODEL_CONFIGS.find((m) => m.id === model) ?? MODEL_CONFIGS[0];
  const activeModelIndex = MODEL_CONFIGS.findIndex((m) => m.id === model);
  const activeVideoTypeIndex = VIDEO_TYPE_IDS.findIndex((t) => t.id === videoType);
  const activeVideoTypeDisplay = vs.videoTypes[activeVideoTypeIndex >= 0 ? activeVideoTypeIndex : 1];
  const activeModelDisplay = vs.models[activeModelIndex >= 0 ? activeModelIndex : 0];

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/video/balance");
      if (res.ok) {
        const data = (await res.json()) as VideoBalance;
        setBalance(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    setDuration(activeModel.defaultDuration);
    if (!activeModel.aspects.includes(aspectRatio)) {
      setAspectRatio(activeModel.aspects[0] ?? "16:9");
    }
    if (!activeModel.needsImage) {
      setImageUrl(null);
      setImagePreview(null);
    }
  }, [model, activeModel, aspectRatio]);

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mediaKind", "image");

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        setError(vs.imageUploadFailed);
        return;
      }

      const data = await res.json();
      setImageUrl(data.publicUrl as string);
      setImagePreview(URL.createObjectURL(file));
    } catch {
      setError(vs.imageUploadFailed);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || state === "generating") return;
    if (activeModel.needsImage && !imageUrl) return;

    setState("generating");
    setError(null);
    setVideoUrl(null);
    setEnrichedPrompt(null);
    setProgress(0);
    setProgressDetail(vs.starting);

    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          videoType,
          duration,
          aspectRatio,
          generateAudio,
          ...(imageUrl ? { imageUrl } : {}),
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) {
        setError(vs.couldNotReadResponse);
        setState("error");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const payload = JSON.parse(line.slice(6)) as Record<string, unknown>;

              if (eventType === "progress") {
                setProgress(payload.percent as number);
                setProgressDetail(payload.detail as string);
              } else if (eventType === "done") {
                setVideoUrl(payload.videoUrl as string);
                if (payload.enrichedPrompt) {
                  setEnrichedPrompt(payload.enrichedPrompt as string);
                }
                setProgress(100);
                setProgressDetail(vs.done);
                setState("done");
                void fetchBalance();
              } else if (eventType === "error") {
                setError(payload.message as string ?? vs.somethingWentWrong);
                setState("error");
              }
            } catch {
              /* ignore parse errors */
            }
            eventType = "";
          }
        }
      }

      setState((s) => s === "generating" ? "idle" : s);
    } catch {
      setError(vs.networkError);
      setState("error");
    }
  };

  const handleBuyCredits = async (mode: string) => {
    setLoadingPack(mode);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, returnPath: "/video-studio" }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url as string;
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingPack(null);
    }
  };

  const resetForm = () => {
    setState("idle");
    setVideoUrl(null);
    setEnrichedPrompt(null);
    setPrompt("");
    setImageUrl(null);
    setImagePreview(null);
    setShowPrompt(false);
  };

  const hasCredits = (balance?.balance ?? 0) > 0;
  const canGenerate = prompt.trim().length >= 3 && hasCredits && state !== "generating" && (!activeModel.needsImage || Boolean(imageUrl));

  return (
    <div className="space-y-8">
      {/* Saldo-kort */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{vs.videoCredits}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {balance === null ? "..." : balance.balance}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {vs.totalPurchased}: {balance?.totalPurchased ?? 0}
          </div>
        </div>
      </div>

      {/* Videotype-velger */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{vs.whatKind}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {vs.whatKindDesc}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {VIDEO_TYPE_IDS.map((t, i) => {
            const display = vs.videoTypes[i];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setVideoType(t.id)}
                disabled={state === "generating"}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border-2 p-4 text-center transition-all cursor-pointer",
                  videoType === t.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-background hover:border-primary/40 hover:shadow-sm",
                )}
              >
                <span className="text-2xl">{t.icon}</span>
                <span className="text-sm font-semibold">{display.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">{display.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Modellvelger */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{vs.chooseModel}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {MODEL_CONFIGS.map((m, i) => {
            const display = vs.models[i];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                disabled={state === "generating"}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border-2 p-5 text-left transition-all cursor-pointer",
                  model === m.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-background hover:border-primary/40 hover:shadow-sm",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold">{display.name}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    {m.badge}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{display.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Generator */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{vs.describeVideo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {vs.describeVideoHint}
        </p>

        <div className="mt-5 space-y-5">
          {/* Bildeopplasting for Kling */}
          {activeModel.needsImage && (
            <div>
              <label className="mb-2 block text-sm font-medium">{vs.imageLabel}</label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageUpload(file);
                  e.target.value = "";
                }}
              />
              {imagePreview ? (
                <div className="flex items-start gap-4">
                  <img
                    src={imagePreview}
                    alt={vs.selectedImage}
                    className="h-32 w-32 rounded-lg border border-border object-cover"
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage || state === "generating"}
                    >
                      {uploadingImage ? dictionary.common.loading : vs.changeImage}
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setImageUrl(null); setImagePreview(null); }}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    >
                      {vs.removeImage}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage || state === "generating"}
                  className="flex h-32 w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-background text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 cursor-pointer disabled:opacity-50"
                >
                  {uploadingImage ? dictionary.common.loading : vs.uploadImageHint}
                </button>
              )}
            </div>
          )}

          {/* Prompt */}
          <div>
            <label className="mb-2 block text-sm font-medium">{vs.videoPromptLabel}</label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3}
              placeholder={activeVideoTypeDisplay.placeholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={1000}
              disabled={state === "generating"}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {vs.charsCount.replace("{count}", String(prompt.length))}
            </span>
          </div>

          {/* Innstillinger */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Varighet */}
            <div>
              <label className="mb-2 block text-sm font-medium">{vs.duration}</label>
              <div className="flex gap-1.5">
                {activeModel.durations.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    disabled={state === "generating"}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      duration === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            {/* Format */}
            <div>
              <label className="mb-2 block text-sm font-medium">{vs.format}</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                disabled={state === "generating"}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                {activeModel.aspects.map((a) => (
                  <option key={a} value={a}>{ASPECT_LABELS[a] ?? a}</option>
                ))}
              </select>
            </div>

            {/* Lyd */}
            <div>
              <label className="mb-2 block text-sm font-medium">{vs.audio}</label>
              <button
                type="button"
                onClick={() => setGenerateAudio((v) => !v)}
                disabled={state === "generating"}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                  generateAudio
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                {generateAudio ? vs.audioOn : vs.audioOff}
              </button>
            </div>
          </div>

          {/* Generer-knapp */}
          <div className="flex items-center justify-end">
            <Button
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              size="lg"
            >
              {state === "generating" ? vs.generatingVideo : vs.generateVideo}
            </Button>
          </div>
        </div>

        {/* Progressbar */}
        {state === "generating" && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{progressDetail || vs.starting}</span>
              <span className="tabular-nums font-semibold text-primary">{progress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {vs.generatingWith
                .replace("{type}", activeVideoTypeDisplay.label)
                .replace("{model}", activeModel.badge)}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {videoUrl && (
          <div className="mt-6 space-y-4">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              {vs.videoGenerated
                .replace("{type}", activeVideoTypeDisplay.label)
                .replace("{model}", activeModel.badge)}
            </p>
            <video
              src={videoUrl}
              controls
              className="w-full max-w-lg rounded-lg border border-border shadow-sm"
            />
            <div className="flex flex-wrap gap-2">
              <a
                href={videoUrl}
                download
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
              >
                {vs.downloadVideo}
              </a>
              <Button variant="outline" size="sm" onClick={resetForm}>
                {vs.createNew}
              </Button>
              {enrichedPrompt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPrompt((v) => !v)}
                >
                  {showPrompt ? vs.hidePrompt : vs.showPrompt}
                </Button>
              )}
            </div>
            {showPrompt && enrichedPrompt && (
              <pre className="max-h-60 overflow-auto rounded-lg border border-border bg-background p-4 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {enrichedPrompt}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Kjøp kreditter */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{vs.buyCredits}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {vs.buyCreditsDesc}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {CREDIT_PACK_MODES.map((mode, i) => {
            const display = vs.creditPacks[i];
            return (
              <div
                key={mode}
                className="flex flex-col items-center gap-3 rounded-xl border border-border bg-background p-5 text-center transition-shadow hover:shadow-md"
              >
                <p className="text-xl font-bold">{display.label}</p>
                <p className="text-2xl font-extrabold text-primary">{display.price}</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingPack !== null}
                  onClick={() => void handleBuyCredits(mode)}
                >
                  {loadingPack === mode ? vs.openingPayment : vs.buy}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
