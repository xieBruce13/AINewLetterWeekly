import type { Config } from "drizzle-kit";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

export default {
  schema: "./lib/db/schema.ts",
  out: "../db/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
} satisfies Config;
