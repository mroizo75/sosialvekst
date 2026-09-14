"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ reset }: ErrorPageProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
          <span className="text-2xl text-destructive">!</span>
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">{t("error.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("error.body")}
          </p>
        </div>
        <Button variant="outline" onClick={reset}>
          {t("error.retry")}
        </Button>
      </div>
    </div>
  );
}
