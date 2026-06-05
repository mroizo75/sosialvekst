"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

type MetaPageOption = {
  id: string;
  name: string;
  igId: string | null;
  igUsername: string | null;
  hasToken: boolean;
};

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

export default function SelectMetaPagePage() {
  const router = useRouter();
  const [pages, setPages] = useState<MetaPageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    try {
      const res = await fetch("/api/social/oauth/meta/pending-pages");
      if (!res.ok) throw new Error("Kunne ikke hente sider");
      const data = (await res.json()) as { pages: MetaPageOption[] };

      if (data.pages.length === 0) {
        router.replace("/dashboard?social_connect=meta_no_pages");
        return;
      }
      setPages(data.pages);
    } catch {
      setError("Kunne ikke laste sider. Prøv å koble til Meta på nytt.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const selectPage = async (page: MetaPageOption) => {
    setSelecting(page.id);
    setError(null);

    try {
      const res = await fetch("/api/social/oauth/meta/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: page.id }),
      });

      const data = (await res.json()) as { redirectUrl?: string; message?: string };

      if (!res.ok) {
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
        throw new Error(data.message ?? "Noe gikk galt");
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt. Prøv igjen.");
      setSelecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="text-sm text-muted-foreground">Henter Facebook-sider...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Velg Facebook-side
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Velg hvilken Facebook-side du vil koble til denne bedriften.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {pages.length > 0 && (
        <div className="mb-6">
          <div className="grid gap-3">
            {pages.map((page) => (
              <Card
                key={page.id}
                className={`transition-all ${selecting === page.id ? "ring-2 ring-primary" : "hover:border-primary/40"}`}
              >
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1877F2] to-[#0C63D4] text-white">
                    <FacebookIcon className="size-6" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-foreground truncate">
                      {page.name}
                    </p>
                    {page.igUsername ? (
                      <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1.5">
                        <InstagramIcon className="size-3.5 text-[#DD2A7B]" />
                        Instagram: @{page.igUsername}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                        Ingen Instagram-konto koblet til denne siden
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={() => void selectPage(page)}
                    disabled={selecting !== null}
                    className="shrink-0"
                  >
                    {selecting === page.id ? (
                      <span className="flex items-center gap-2">
                        <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Kobler...
                      </span>
                    ) : (
                      "Koble denne"
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {pages.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-4 mb-6">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Ser du ikke riktig side?</span>{" "}
            Sørg for at du velger riktige sider i Facebook-dialogen når du gir tilgang.{" "}
            <a
              href="/dashboard/koble-meta"
              className="font-medium text-primary hover:underline"
            >
              Koble til på nytt
            </a>
          </p>
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Avbryt og gå tilbake
        </button>
      </div>
    </div>
  );
}
