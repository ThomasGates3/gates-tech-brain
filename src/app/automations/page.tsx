import { PageShell } from "@/components/deck/PageShell";
import { AutomationsPanel } from "@/components/deck/AutomationsPanel";

export const metadata = { title: "Automations · Gates Tech Brain" };

export default function AutomationsPage() {
  return (
    <PageShell title="Automations" subtitle="Draft-only playbooks. Dry run generates text; Run + deliver posts it to the deck and Discord. Nothing here sends outreach.">
      <AutomationsPanel />
    </PageShell>
  );
}
