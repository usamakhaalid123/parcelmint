import { defineConfig } from "drizzle-kit";

import { loadLocalEnvironmentFile } from "./src/config/load-local-env";

loadLocalEnvironmentFile();

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  out: "./src/db/migrations",
  schema: "./src/db/schema/index.ts",
  strict: true,
  verbose: true,
  ...(databaseUrl === undefined ? {} : { dbCredentials: { url: databaseUrl } }),
});
