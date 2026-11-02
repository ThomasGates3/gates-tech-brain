import type { MetadataRoute } from "next";

/** Installable PWA: "Add to Home Screen" opens straight into the phone approve view. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gates Tech Brain",
    short_name: "Brain",
    description: "Approve today's emails in a minute.",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050914",
    theme_color: "#050914",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
