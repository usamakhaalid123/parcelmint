import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { loadLocalEnvironmentFile } from "@/config/load-local-env";
import { getDatabasePool } from "@/db/client";
import { provisionInitialOwner } from "@/modules/auth/server/owner-provisioning";

loadLocalEnvironmentFile();

const { values } = parseArgs({
  options: {
    "identity-id": { type: "string" },
    reason: { type: "string" },
  },
  strict: true,
});

try {
  await provisionInitialOwner({
    correlationId: randomUUID(),
    identityId: values["identity-id"] ?? "",
    reason: values.reason ?? "",
  });
  process.stdout.write("Initial owner provisioned successfully.\n");
} finally {
  await getDatabasePool().end();
}
