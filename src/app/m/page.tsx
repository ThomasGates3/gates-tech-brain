import type { Metadata, Viewport } from "next";
import { ApproveDeck } from "@/components/mobile/ApproveDeck";

export const metadata: Metadata = {
  title: "Approve · Gates Brain",
  appleWebApp: { capable: true, title: "Brain", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050914",
};

// TODO(push): a 7am "drafts waiting" web push needs VAPID keys + a service worker + a
// subscription table. Left out to avoid a new env var / paid service; the morning
// Discord ping already covers it.
export default function MobileApprovePage() {
  return <ApproveDeck />;
}
