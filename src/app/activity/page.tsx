import { PageShell } from "@/components/deck/PageShell";
import { ActivityFeed } from "@/components/deck/Telemetry";

export const metadata = { title: "Activity · Gates Tech Brain" };

export default function ActivityPage() {
  return (
    <PageShell title="Activity" subtitle="What the bots, Thomas and the Brain did, newest first.">
      <ActivityFeed limit={200} filterable className="max-h-[calc(100dvh-170px)]" />
    </PageShell>
  );
}
