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
  source: "oauth" | "business_manager";
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

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const LockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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
    if (!page.hasToken) {
      window.location.href = "/dashboard/koble-meta";
      return;
    }

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

  const readyPages = pages.filter((p) => p.hasToken);
  const needsAuthPages = pages.filter((p) => !p.hasToken);

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

      {readyPages.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <CheckIcon className="size-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-foreground">
              Klare til tilkobling ({readyPages.length})
            </h2>
          </div>
          <div className="grid gap-3">
            {readyPages.map((page) => (
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

      {needsAuthPages.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <LockIcon className="size-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-foreground">
              Trenger autorisasjon ({needsAuthPages.length})
            </h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Disse sidene ble funnet via Business Manager, men du ga ikke appen tilgang i Facebook-dialogen. Koble til på nytt og velg disse sidene.
          </p>
          <div className="grid gap-3">
            {needsAuthPages.map((page) => (
              <Card
                key={page.id}
                className="border-amber-200/50 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-950/10"
              >
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
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
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Instagram-status ukjent
                      </p>
                    )}
                  </div>

                  <a
                    href="/dashboard/koble-meta"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-950/80"
                  >
                    <LockIcon className="size-3.5" />
                    Autoriser
                  </a>
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
            Sider som er i en Facebook Business Manager blir automatisk funnet.
            Hvis siden din ikke er i en Business Manager, må du velge den manuelt
            i Facebook-dialogen.{" "}
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
