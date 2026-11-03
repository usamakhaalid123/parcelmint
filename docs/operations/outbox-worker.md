# Transactional outbox worker

Business transactions write provider work to `outbox_events`. The scheduled worker claims ready rows
atomically with `FOR UPDATE SKIP LOCKED`, so overlapping invocations cannot process the same event.

Invoke the worker with:

```http
POST /api/v1/jobs/outbox
Authorization: Bearer <WORKER_INVOCATION_SECRET>
```

Configure a random secret of at least 32 characters in the hosting secret manager. Never pass it in a
query string. Responses and logs must not contain the secret or provider payloads.

The worker:

- releases leases older than ten minutes;
- claims at most 25 events per invocation;
- records only bounded error codes, not raw provider messages;
- uses exponential backoff for transient failures;
- moves exhausted events to `dead_letter` after eight attempts;
- updates an event only while the same worker still owns its lease.

Provider handlers are registered when their owning feature is implemented. An unregistered topic is
treated as a retryable configuration failure and eventually becomes reviewable dead-letter work.
Scheduled invocations must be overlap-safe and monitored for repeated failures and growing pending or
dead-letter counts.
