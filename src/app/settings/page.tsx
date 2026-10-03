import { PageShell } from "@/components/deck/PageShell";
import { SettingsPanel } from "@/components/deck/DeckModals";
import { NotificationsPanel } from "@/components/deck/NotificationsPanel";

export const metadata = { title: "Settings · Gates Tech Brain" };

export default function SettingsPage() {
  return (
    <PageShell title="Settings" subtitle="Which model runs chat and agents, the deck's voice, and which Discord pings you get.">
      <div className="grid items-start gap-6 lg:grid-cols-2"><div><SettingsPanel /></div><div><NotificationsPanel /></div></div>
    </PageShell>
  );
}
