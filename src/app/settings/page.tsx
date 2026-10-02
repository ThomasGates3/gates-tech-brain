import { PageShell } from "@/components/deck/PageShell";
import { SettingsPanel } from "@/components/deck/DeckModals";

export const metadata = { title: "Settings · Gates Tech Brain" };

export default function SettingsPage() {
  return (
    <PageShell title="Settings" subtitle="Which model runs chat and agents, and the deck's voice.">
      <div className="max-w-2xl"><SettingsPanel /></div>
    </PageShell>
  );
}
