import type { MetadataRoute } from "next";

/**
 * Installable PWA. It opens on the dashboard: on a computer that is the full desktop deck (a narrow window
 * gets the stacked phone layout), and phones are sent on to the /m approve view by the middleware.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gates Tech Brain",
    short_name: "Brain",
    description: "Approve today's emails in a minute.",
    // The app id used to default to start_url ("/m"). Pin it so already-installed apps keep their
    // identity and pick up the new start_url instead of being treated as a different app.
    id: "/m",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050914",
    theme_color: "#050914",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
