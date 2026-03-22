"use client";

import { Button } from "@/components/ui/Button";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ reset }: ErrorPageProps) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
          <span className="text-2xl text-destructive">!</span>
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Noe gikk galt</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            En uventet feil oppstod. Prøv å laste siden på nytt.
          </p>
        </div>
        <Button variant="outline" onClick={reset}>
          Prøv igjen
        </Button>
      </div>
    </div>
  );
}
