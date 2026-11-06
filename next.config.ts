import type { NextConfig } from "next";

// Report-only for now: violations show in the browser console and nothing is blocked.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  headers: async () => [{ source: "/:path*", headers: [{ key: "Content-Security-Policy-Report-Only", value: CSP }] }],
};

export default nextConfig;
