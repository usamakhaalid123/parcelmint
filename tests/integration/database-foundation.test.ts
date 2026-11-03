import { randomUUID } from "node:crypto";

import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { getDatabase } from "@/db/client";
import * as schema from "@/db/schema";
import {
  auditLogs,
  outboxEvents,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { seedAuthorizationReferenceData } from "@/db/seed-reference-data";
import { AuthorizationDeniedError, type StaffPrincipal } from "@/modules/auth";
import { provisionInitialOwner } from "@/modules/auth/server/owner-provisioning";
import { assignRole } from "@/modules/auth/server/role-service";
import { claimOutboxEvents, markOutboxEventProcessed, runOutboxWorker } from "@/modules/jobs";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(testDatabaseUrl === undefined)("phase 1 database foundation", () => {
  let pool: Pool;
  let database: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testDatabaseUrl });
    database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: "src/db/migrations" });
    await seedAuthorizationReferenceData(database);
    await seedAuthorizationReferenceData(database);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("seeds the authorization catalog idempotently", async () => {
    const [roleCount] = await database.select({ value: count() }).from(roles);
    const [permissionCount] = await database.select({ value: count() }).from(permissions);
    const [grantCount] = await database.select({ value: count() }).from(rolePermissions);

    expect(roleCount?.value).toBe(7);
    expect(permissionCount?.value).toBe(10);
    expect(grantCount?.value).toBe(35);
  });

  it("enforces append-only audit history", async () => {
    const [auditLog] = await database
      .insert(auditLogs)
      .values({
        action: "phase1.integration_test",
        correlationId: randomUUID(),
        outcome: "success",
        resourceType: "database",
      })
      .returning({ id: auditLogs.id });

    expect(auditLog).toBeDefined();
    await expect(
      database
        .update(auditLogs)
        .set({ reason: "mutation must fail" })
        .where(eq(auditLogs.id, auditLog?.id ?? "")),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("rejects processing events without an atomic worker lease", async () => {
    await expect(
      database.insert(outboxEvents).values({
        aggregateId: "missing-lease",
        aggregateType: "test",
        idempotencyKey: `phase1-invalid-${randomUUID()}`,
        payload: {},
        status: "processing",
        topic: "phase1.test",
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("lets overlapping workers claim different events", async () => {
    await database.insert(outboxEvents).values([
      {
        aggregateId: "one",
        aggregateType: "claim-test",
        idempotencyKey: `phase1-claim-${randomUUID()}`,
        payload: {},
        topic: "phase1.claim",
      },
      {
        aggregateId: "two",
        aggregateType: "claim-test",
        idempotencyKey: `phase1-claim-${randomUUID()}`,
        payload: {},
        topic: "phase1.claim",
      },
    ]);

    const [firstClaim, secondClaim] = await Promise.all([
      claimOutboxEvents("worker-one", 1, database),
      claimOutboxEvents("worker-two", 1, database),
    ]);

    expect(firstClaim).toHaveLength(1);
    expect(secondClaim).toHaveLength(1);
    expect(firstClaim[0]?.id).not.toBe(secondClaim[0]?.id);
    expect(
      await markOutboxEventProcessed(firstClaim[0]?.id ?? "", "worker-one", new Date(), database),
    ).toBe(true);
    expect(
      await markOutboxEventProcessed(secondClaim[0]?.id ?? "", "worker-one", new Date(), database),
    ).toBe(false);
    expect(
      await markOutboxEventProcessed(secondClaim[0]?.id ?? "", "worker-two", new Date(), database),
    ).toBe(true);
  });

  it("provisions the first owner only after provider identity verification", async () => {
    const identityId = randomUUID();
    const correlationId = randomUUID();

    await provisionInitialOwner(
      { correlationId, identityId, reason: "Initial controlled owner bootstrap" },
      { database, verifyIdentity: async () => true },
    );

    const [grant] = await database
      .select({ roleKey: roles.key })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(users.identityId, identityId), eq(users.identityProvider, "supabase")));
    const [audit] = await database
      .select({ outcome: auditLogs.outcome })
      .from(auditLogs)
      .where(eq(auditLogs.correlationId, correlationId));

    expect(grant?.roleKey).toBe("owner");
    expect(audit?.outcome).toBe("success");
  });

  it("audits allowed and denied role assignments", async () => {
    const [actor, target] = await database
      .insert(users)
      .values([
        { accountType: "staff", identityId: randomUUID() },
        { accountType: "staff", identityId: randomUUID() },
      ])
      .returning({ id: users.id });

    expect(actor).toBeDefined();
    expect(target).toBeDefined();

    const actorPrincipal: StaffPrincipal = {
      accountType: "staff",
      permissionKeys: new Set(["staff.manage"]),
      status: "active",
      userId: actor?.id ?? "",
    };

    await assignRole(
      {
        actor: actorPrincipal,
        correlationId: randomUUID(),
        reason: "Assign order operations responsibility",
        roleKey: "order_manager",
        targetUserId: target?.id ?? "",
      },
      database,
    );
    await expect(
      assignRole(
        {
          actor: { ...actorPrincipal, permissionKeys: new Set() },
          correlationId: randomUUID(),
          reason: "Attempt without an explicit grant",
          roleKey: "administrator",
          targetUserId: target?.id ?? "",
        },
        database,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    const outcomes = await database
      .select({ outcome: auditLogs.outcome })
      .from(auditLogs)
      .where(
        and(eq(auditLogs.action, "staff.role.assign"), eq(auditLogs.resourceId, target?.id ?? "")),
      );

    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(["denied", "success"]);
  });

  it("processes supported outbox events and safely retries failures", async () => {
    const failureKey = `phase1-worker-${randomUUID()}`;

    await database.insert(outboxEvents).values([
      {
        aggregateId: "success",
        aggregateType: "worker-test",
        idempotencyKey: `phase1-worker-${randomUUID()}`,
        payload: {},
        topic: "phase1.success",
      },
      {
        aggregateId: "failure",
        aggregateType: "worker-test",
        idempotencyKey: failureKey,
        payload: {},
        topic: "phase1.failure",
      },
    ]);

    const result = await runOutboxWorker({
      batchSize: 10,
      database,
      handlers: {
        "phase1.failure": async () => {
          throw new Error("provider detail must not be persisted");
        },
        "phase1.success": async () => undefined,
      },
      now: new Date(Date.now() + 60_000),
      workerId: "integration-worker",
    });

    const [failedEvent] = await database
      .select({
        idempotencyKey: outboxEvents.idempotencyKey,
        lastErrorCode: outboxEvents.lastErrorCode,
        status: outboxEvents.status,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.idempotencyKey, failureKey));

    expect(result.processed).toBe(1);
    expect(result.retried).toBe(1);
    expect(failedEvent).toEqual({
      idempotencyKey: failureKey,
      lastErrorCode: "handler_failed",
      status: "pending",
    });
  });
});
