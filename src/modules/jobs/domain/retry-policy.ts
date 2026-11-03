export type RetryDecision = { outcome: "dead_letter" } | { availableAt: Date; outcome: "retry" };

export type RetryPolicy = {
  baseDelayMilliseconds: number;
  maximumAttempts: number;
  maximumDelayMilliseconds: number;
};

export const defaultOutboxRetryPolicy: RetryPolicy = {
  baseDelayMilliseconds: 30_000,
  maximumAttempts: 8,
  maximumDelayMilliseconds: 3_600_000,
};

export function decideOutboxRetry(
  completedAttempts: number,
  now: Date,
  policy: RetryPolicy = defaultOutboxRetryPolicy,
): RetryDecision {
  if (!Number.isInteger(completedAttempts) || completedAttempts < 1) {
    throw new RangeError("completedAttempts must be a positive integer");
  }

  if (completedAttempts >= policy.maximumAttempts) {
    return { outcome: "dead_letter" };
  }

  const delay = Math.min(
    policy.baseDelayMilliseconds * 2 ** (completedAttempts - 1),
    policy.maximumDelayMilliseconds,
  );

  return {
    availableAt: new Date(now.getTime() + delay),
    outcome: "retry",
  };
}
