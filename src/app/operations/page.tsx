import { PageShell } from "@/components/deck/PageShell";
import { OperationsPanel } from "@/components/deck/DeckModals";

const TABS = ["connections", "agents", "access"] as const;

export const metadata = { title: "Operations · Gates Tech Brain" };

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initial = (TABS as readonly string[]).includes(tab ?? "") ? (tab as (typeof TABS)[number]) : "connections";
  return (
    <PageShell title="Operations" subtitle="Connections, the Grok bot roster, and API keys for the MCP server.">
      <OperationsPanel initialTab={initial} wide />
    </PageShell>
  );
}
