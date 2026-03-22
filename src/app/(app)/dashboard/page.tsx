import { DashboardPanel } from "@/components/dashboard/DashboardPanel";

export default function DashboardPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Oversikt</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Se status på innhold, abonnement og publisering.
        </p>
      </div>
      <DashboardPanel />
    </>
  );
}
