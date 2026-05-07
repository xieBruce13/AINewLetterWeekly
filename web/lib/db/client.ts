import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy web/.env.example to web/.env.local and fill it in."
  );
}

// Reuse the postgres client across hot reloads in dev to avoid exhausting
// connection pools.
const globalForPg = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

export const sqlClient =
  globalForPg.pgClient ??
  postgres(connectionString, {
    max: 10,
    prepare: false, // pgbouncer / Supabase compatibility
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgClient = sqlClient;
}

export const db = drizzle(sqlClient, { schema });

export { schema };
