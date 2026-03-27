"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

type VideoBalance = {
  balance: number;
  totalPurchased: number;
};

type GenerationState = "idle" | "generating" | "done" | "error";

const CREDIT_PACKS = [
  { mode: "video_credits_10", label: "10 videoer", price: "kr 99" },
  { mode: "video_credits_30", label: "30 videoer", price: "kr 249" },
  { mode: "video_credits_100", label: "100 videoer", price: "kr 699" },
] as const;

export const VideoStudio = () => {
  const [balance, setBalance] = useState<VideoBalance | null>(null);
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<GenerationState>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

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

  const handleGenerate = async () => {
    if (!prompt.trim() || state === "generating") return;

    setState("generating");
    setError(null);
    setVideoUrl(null);

    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Noe gikk galt under genereringen.");
        setState("error");
        return;
      }

      setVideoUrl(data.videoUrl as string);
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

  const hasCredits = (balance?.balance ?? 0) > 0;

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

      {/* Generator */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Generer video</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Beskriv videoen du ønsker. AI-en genererer en kort video basert på prompten din.
        </p>

        <div className="mt-4 space-y-4">
          <textarea
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={4}
            placeholder="F.eks.: En profesjonell introvideo for et rørleggerfirma med verktøy og arbeidsbil..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={1000}
            disabled={state === "generating"}
          />
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">{prompt.length}/1000 tegn</span>
            <Button
              onClick={() => void handleGenerate()}
              disabled={!prompt.trim() || state === "generating" || !hasCredits}
            >
              {state === "generating" ? "Genererer video..." : "Generer video (1 kreditt)"}
            </Button>
          </div>
        </div>

        {state === "generating" && (
          <div className="mt-6 flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Videoen genereres — dette kan ta 1-3 minutter...</span>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {videoUrl && (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">Video generert!</p>
            <video
              src={videoUrl}
              controls
              className="w-full max-w-lg rounded-lg border border-border shadow-sm"
            />
            <div className="flex gap-2">
              <a
                href={videoUrl}
                download
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
              >
                Last ned video
              </a>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setState("idle");
                  setVideoUrl(null);
                  setPrompt("");
                }}
              >
                Lag ny video
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Kjøp kreditter */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Kjøp videokreditter</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hver kreditt lar deg generere én AI-video. Velg en pakke som passer for deg.
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
