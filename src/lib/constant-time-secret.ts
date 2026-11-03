import { timingSafeEqual } from "node:crypto";

export function secretsMatch(actual: string | null, expected: string): boolean {
  if (actual === null) {
    return false;
  }

  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
