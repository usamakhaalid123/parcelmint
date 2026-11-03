type LogLevel = "debug" | "info" | "warn" | "error";

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const sensitiveKeyPattern =
  /address|authorization|cookie|email|password|phone|secret|session|token/i;

function sanitize(value: unknown, seen: WeakSet<object>): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return { name: value.name, message: "[REDACTED_ERROR_MESSAGE]" };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[CIRCULAR]";
    }

    seen.add(value);
    return value.map((item) => sanitize(item, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[CIRCULAR]";
    }

    seen.add(value);

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[REDACTED]" : sanitize(item, seen),
      ]),
    );
  }

  return String(value);
}

export type LogEntry = {
  context: JsonValue;
  level: LogLevel;
  message: string;
  timestamp: string;
};

export function createLogEntry(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {},
  timestamp = new Date(),
): LogEntry {
  return {
    context: sanitize(context, new WeakSet<object>()),
    level,
    message,
    timestamp: timestamp.toISOString(),
  };
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const serializedEntry = JSON.stringify(createLogEntry(level, message, context));

  if (level === "error") {
    console.error(serializedEntry);
    return;
  }

  if (level === "warn") {
    console.warn(serializedEntry);
    return;
  }

  if (level === "debug") {
    console.debug(serializedEntry);
    return;
  }

  console.info(serializedEntry);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
};
