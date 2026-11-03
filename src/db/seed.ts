import { loadLocalEnvironmentFile } from "@/config/load-local-env";
import { getDatabasePool } from "@/db/client";
import { seedAuthorizationReferenceData } from "@/db/seed-reference-data";

loadLocalEnvironmentFile();

try {
  await seedAuthorizationReferenceData();
} finally {
  await getDatabasePool().end();
}
