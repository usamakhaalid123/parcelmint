import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseEnvironment } from "@/config/database-env";

import * as schema from "./schema";

let pool: Pool | undefined;

export function getDatabasePool(): Pool {
  pool ??= new Pool({
    connectionString: getDatabaseEnvironment().pooledUrl,
    max: 10,
  });

  return pool;
}

export function getDatabase() {
  return drizzle(getDatabasePool(), { schema });
}
