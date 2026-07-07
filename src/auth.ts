/**
 * Auth.js (next-auth v5 beta) configuration.
 *
 * Adapter: Neon/Drizzle — guarded so the app builds even when DATABASE_URL
 * is absent (local dev without DB). Set DATABASE_URL in .env.local to enable
 * session persistence.
 *
 * Providers: GitHub OAuth (GITHUB_ID + GITHUB_SECRET) and magic-link Email
 * (requires EMAIL_SERVER + EMAIL_FROM env vars).
 *
 * Env vars introduced:
 *   AUTH_SECRET        — required; generate with `openssl rand -base64 32`
 *   AUTH_GITHUB_ID     — GitHub OAuth app client id
 *   AUTH_GITHUB_SECRET — GitHub OAuth app client secret
 *   DATABASE_URL       — Neon connection string (optional locally)
 */

import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID ?? "",
      clientSecret: process.env.AUTH_GITHUB_SECRET ?? "",
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
  },
});
