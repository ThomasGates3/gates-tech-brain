import { connection } from "next/server";
import { PageShell } from "@/components/deck/PageShell";
import { ContentStudio } from "@/components/content/ContentStudio";
import { board } from "@/lib/content/studio";

export const metadata = { title: "Content Studio · Gates Tech Brain" };

export default async function ContentPage() {
  await connection();
  return (
    <PageShell title="Content Studio" subtitle="Today's Instagram slots, ready to film and post. Copy the hook, caption and DM script, open the demo site, mark it posted.">
      <ContentStudio initial={await board()} />
    </PageShell>
  );
}
