import { PageShell } from "@/components/deck/PageShell";
import { LeadsBoard } from "@/components/deck/LeadsBoard";

export const metadata = { title: "Today's leads · Gates Tech Brain" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { date, lane, status, tier, open } = await searchParams;
  return (
    <PageShell title="Leads" subtitle="Every lead for the day with its lane, status and next step. Buttons run the same rules as the bots.">
      <LeadsBoard initial={{ date, lane, status, tier, open }} />
    </PageShell>
  );
}
