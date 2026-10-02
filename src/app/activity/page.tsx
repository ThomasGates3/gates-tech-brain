import { PageShell } from "@/components/deck/PageShell";
import { ActivityFeed } from "@/components/deck/Telemetry";

export const metadata = { title: "Activity · Gates Tech Brain" };

export default function ActivityPage() {
  return (
    <PageShell title="Activity">
      <ActivityFeed limit={200} filterable />
    </PageShell>
  );
}
