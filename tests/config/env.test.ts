// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/config/env.config.spec.ts; adapted: synthetic values and standalone vitest tests.
import { describe, expect, it } from 'vitest';
import { EnvSchema, parseRedisPort, parseTcpPort, parseOptionalCliTimeoutMs } from '../../src/config/env';
describe('strict environment parsing', () => {
  it('uses defaults for missing values', () => { const result = EnvSchema.parse({ DATABASE_URL: 'postgresql://localhost/example' }); expect(result.REDIS_PORT).toBe(6379); expect(result.PORT).toBe(3011); });
  it('rejects partial and out-of-range ports', () => { for (const value of ['6379oops', '1.5', '-1', '65536', {}]) expect(EnvSchema.safeParse({ DATABASE_URL: 'postgresql://localhost/example', REDIS_PORT: value }).success).toBe(false); });
  it('handles whitespace and optional values without coercing objects', () => { expect(parseRedisPort(' 6379 ')).toBe(6379); expect(parseTcpPort(undefined)).toBeUndefined(); expect(Number.isNaN(parseTcpPort(' ')!)).toBe(true); expect(Number.isNaN(parseOptionalCliTimeoutMs([]))).toBe(true); });
});
