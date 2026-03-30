import { DashboardPanel } from "@/components/dashboard/DashboardPanel";

export default function DashboardPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Oversikt</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Status på innhold, publisering og tilkoblede kontoer.
        </p>
      </div>
      <DashboardPanel />
    </>
  );
}
