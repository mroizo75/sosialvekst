"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type VideoBalance = {
  balance: number;
  totalPurchased: number;
};

type GenerationState = "idle" | "generating" | "done" | "error";
type VideoModel = "veo3" | "kling";
type VideoType = "product" | "intro" | "service" | "event" | "testimonial";

const MODELS = [
  {
    id: "veo3" as const,
    name: "Tekst til video",
    description: "Lag video fra en tekstbeskrivelse. Inkluderer musikk og lydeffekter.",
    badge: "Google Veo 3",
    durations: [4, 6, 8] as number[],
    defaultDuration: 8,
    needsImage: false,
    aspects: ["16:9", "9:16"] as string[],
  },
  {
    id: "kling" as const,
    name: "Bilde til video",
    description: "Animer et produktbilde eller foto til en profesjonell video.",
    badge: "Kling v3 Pro",
    durations: [5, 10] as number[],
    defaultDuration: 5,
    needsImage: true,
    aspects: ["16:9", "9:16", "1:1"] as string[],
  },
] as const;

const VIDEO_TYPES = [
  {
    id: "product" as VideoType,
    label: "Produktvideo",
    icon: "📦",
    description: "Vis frem et produkt fra alle vinkler",
    placeholder: "Hva skal vises? F.eks.: Vårt nye verktøysett i bruk på en byggeplass",
  },
  {
    id: "intro" as VideoType,
    label: "Bedriftsintro",
    icon: "🏢",
    description: "Presenter bedriften profesjonelt",
    placeholder: "Hva er viktig å formidle? F.eks.: Vi er et lokalt rørleggerfirma med 20 års erfaring",
  },
  {
    id: "service" as VideoType,
    label: "Tjeneste i aksjon",
    icon: "⚡",
    description: "Vis tjenesten deres i arbeid",
    placeholder: "Hvilken tjeneste? F.eks.: Profesjonell rengjøring av kontorer og næringsbygg",
  },
  {
    id: "event" as VideoType,
    label: "Kampanje / Event",
    icon: "🎯",
    description: "Skap energi rundt en kampanje eller event",
    placeholder: "Hva promoteres? F.eks.: Sommerkampanje med 30% rabatt på alle tjenester",
  },
  {
    id: "testimonial" as VideoType,
    label: "Kundehistorie",
    icon: "💬",
    description: "Vis en fornøyd kunde-opplevelse",
    placeholder: "Hva er historien? F.eks.: En bedriftskunde som sparte tid med vår løsning",
  },
] as const;

const CREDIT_PACKS = [
  { mode: "video_credits_10", label: "10 videoer", price: "kr 99" },
  { mode: "video_credits_30", label: "30 videoer", price: "kr 249" },
  { mode: "video_credits_100", label: "100 videoer", price: "kr 699" },
] as const;

const ASPECT_LABELS: Record<string, string> = {
  "16:9": "Liggende (16:9)",
  "9:16": "Stående (9:16)",
  "1:1": "Kvadrat (1:1)",
};

export const VideoStudio = () => {
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
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const activeModel = MODELS.find((m) => m.id === model) ?? MODELS[0];
  const activeVideoType = VIDEO_TYPES.find((t) => t.id === videoType) ?? VIDEO_TYPES[1];

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
        setError("Bildeopplasting feilet.");
        return;
      }

      const data = await res.json();
      setImageUrl(data.publicUrl as string);
      setImagePreview(URL.createObjectURL(file));
    } catch {
      setError("Bildeopplasting feilet.");
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

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Noe gikk galt under genereringen.");
        setState("error");
        return;
      }

      setVideoUrl(data.videoUrl as string);
      if (data.enrichedPrompt) {
        setEnrichedPrompt(data.enrichedPrompt as string);
      }
      setState("done");
      void fetchBalance();
    } catch {
      setError("Nettverksfeil — prøv igjen.");
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
            <p className="text-sm font-medium text-muted-foreground">Videokreditter</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {balance === null ? "..." : balance.balance}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Totalt kjøpt: {balance?.totalPurchased ?? 0}
          </div>
        </div>
      </div>

      {/* Videotype-velger */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Hva slags video vil du lage?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Velg en type — AI-en tilpasser automatisk stil, kamera og stemning basert på bedriften din.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {VIDEO_TYPES.map((t) => (
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
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{t.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Modellvelger */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Velg AI-modell</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {MODELS.map((m) => (
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
                <span className="text-base font-semibold">{m.name}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {m.badge}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{m.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Generator */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Beskriv videoen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Skriv kort hva videoen handler om. AI-en bygger automatisk en profesjonell prompt med bedriftsinformasjonen din.
        </p>

        <div className="mt-5 space-y-5">
          {/* Bildeopplasting for Kling */}
          {activeModel.needsImage && (
            <div>
              <label className="mb-2 block text-sm font-medium">Bilde</label>
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
                    alt="Valgt bilde"
                    className="h-32 w-32 rounded-lg border border-border object-cover"
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage || state === "generating"}
                    >
                      {uploadingImage ? "Laster opp..." : "Bytt bilde"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setImageUrl(null); setImagePreview(null); }}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    >
                      Fjern bilde
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
                  {uploadingImage ? "Laster opp..." : "Klikk for å laste opp bilde (produktfoto, logo, osv.)"}
                </button>
              )}
            </div>
          )}

          {/* Prompt */}
          <div>
            <label className="mb-2 block text-sm font-medium">Hva handler videoen om?</label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3}
              placeholder={activeVideoType.placeholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={1000}
              disabled={state === "generating"}
            />
            <span className="mt-1 block text-xs text-muted-foreground">{prompt.length}/1000 tegn</span>
          </div>

          {/* Innstillinger */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Varighet */}
            <div>
              <label className="mb-2 block text-sm font-medium">Varighet</label>
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
              <label className="mb-2 block text-sm font-medium">Format</label>
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
              <label className="mb-2 block text-sm font-medium">Lyd</label>
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
                {generateAudio ? "Musikk og lyd på" : "Lyd av"}
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
              {state === "generating" ? "Genererer video..." : "Generer video (1 kreditt)"}
            </Button>
          </div>
        </div>

        {/* Status */}
        {state === "generating" && (
          <div className="mt-6 flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <svg className="h-5 w-5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>
              AI-en lager en {activeVideoType.label.toLowerCase()} med {activeModel.badge} — dette kan ta 1-4 minutter...
            </span>
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
              {activeVideoType.label} generert med {activeModel.badge}!
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
                Last ned video
              </a>
              <Button variant="outline" size="sm" onClick={resetForm}>
                Lag ny video
              </Button>
              {enrichedPrompt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPrompt((v) => !v)}
                >
                  {showPrompt ? "Skjul AI-prompt" : "Vis AI-prompt"}
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
        <h2 className="text-lg font-semibold">Kjøp videokreditter</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hver kreditt lar deg generere en AI-video med musikk, uansett modell eller varighet.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.mode}
              className="flex flex-col items-center gap-3 rounded-xl border border-border bg-background p-5 text-center transition-shadow hover:shadow-md"
            >
              <p className="text-xl font-bold">{pack.label}</p>
              <p className="text-2xl font-extrabold text-primary">{pack.price}</p>
              <Button
                variant="outline"
                size="sm"
                disabled={loadingPack !== null}
                onClick={() => void handleBuyCredits(pack.mode)}
              >
                {loadingPack === pack.mode ? "Åpner betaling..." : "Kjøp"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
