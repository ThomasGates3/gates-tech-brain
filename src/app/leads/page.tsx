import { PageShell } from "@/components/deck/PageShell";
import { LeadsBoard } from "@/components/deck/LeadsBoard";

export const metadata = { title: "Today's leads · Gates Tech Brain" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { date, lane, status, tier } = await searchParams;
  return (
    <PageShell title="Today's leads">
      <LeadsBoard initial={{ date, lane, status, tier }} />
    </PageShell>
  );
}
