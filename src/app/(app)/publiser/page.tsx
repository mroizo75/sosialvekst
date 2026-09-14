import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/get-locale";

export default async function PublishPage() {
  const locale = await getLocale();
  const dict = getDictionary(locale);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{dict.publish.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dict.publish.description}
        </p>
      </div>
      <DashboardPanel />
    </>
  );
}
