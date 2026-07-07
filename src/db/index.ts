/**
 * Neon serverless DB client (Drizzle).
 * Uses DATABASE_URL (Neon connection string). The client is lazy — no network
 * call until a query runs — so build/typecheck succeed without a live DB.
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost/placeholder";

export const db = drizzle(neon(connectionString), { schema });
export { schema };
