import { CalendarBillingActions } from "@/components/calendar/CalendarBillingActions";
import { PostCalendar } from "@/components/calendar/PostCalendar";

export default function CalendarPage() {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kalender</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Se alle planlagte poster. Klikk på en post for å redigere eller godkjenne.
          </p>
        </div>
        <CalendarBillingActions />
      </div>
      <PostCalendar />
    </>
  );
}
