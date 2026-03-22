import { DashboardPanel } from "@/components/dashboard/DashboardPanel";

export default function PublishPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Publisering</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Legg godkjente poster i kø og start publisering til sosiale medier.
        </p>
      </div>
      <DashboardPanel />
    </>
  );
}
