import { PageShell } from "@/components/deck/PageShell";
import { LeadsBoard } from "@/components/deck/LeadsBoard";

export const metadata = { title: "Leads · Gates Tech Brain" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { date, lane, status, tier, open, folder } = await searchParams;
  return (
    <PageShell title="Leads" subtitle="Every open lead across days, sorted into your four folders. Open any email to read or edit it. Buttons run the same rules as the bots.">
      <LeadsBoard initial={{ date, lane, status, tier, open, folder }} />
    </PageShell>
  );
}
