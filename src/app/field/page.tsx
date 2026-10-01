import type { Metadata } from "next";
import { FieldConsole } from "@/components/field/FieldConsole";

export const metadata: Metadata = {
  title: "Field Console — Gates",
  description: "Internal ops console for Email 1 cold outreach.",
  robots: { index: false, follow: false },
};

export default function FieldPage() {
  return <FieldConsole />;
}
