// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/config/env.config.ts; adapted: removed framework dependency; kept strict validation
import { z } from 'zod';

const DEFAULT_REDIS_PORT = 6379;
const MIN_TCP_PORT = 1;
const MAX_TCP_PORT = 65535;
const DEFAULT_OPTIONAL_CLI_TIMEOUT_MS = 3000;
const MIN_OPTIONAL_CLI_TIMEOUT_MS = 1;
const MAX_OPTIONAL_CLI_TIMEOUT_MS = 30000;

/**
 * Narrow unknown env input to a TCP port number without stringifying objects/arrays.
 * Returns NaN when the value cannot be interpreted as a port (schema validation fails).
 */
export function parseRedisPort(val: unknown): number {
  if (val === undefined || val === null || val === '') {
    return DEFAULT_REDIS_PORT;
  }
  if (typeof val === 'number') {
    return val;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') {
      return DEFAULT_REDIS_PORT;
    }
    if (!/^\d+$/.test(trimmed)) {
      return Number.NaN;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }
  return Number.NaN;
}

/** Strictly parse optional TCP port environment values without partial parseInt. */
export function parseTcpPort(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') {
    return undefined;
  }
  if (typeof val === 'number') {
    return val;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '' || !/^\d+$/.test(trimmed)) {
      return Number.NaN;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }
  return Number.NaN;
}

/** Parse optional optional CLI fail-fast timeout in milliseconds. */
export function parseOptionalCliTimeoutMs(val: unknown): number {
  if (val === undefined || val === null || val === '') {
    return DEFAULT_OPTIONAL_CLI_TIMEOUT_MS;
  }
  if (typeof val === 'number') {
    return Number.isInteger(val) ? val : Number.NaN;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') {
      return DEFAULT_OPTIONAL_CLI_TIMEOUT_MS;
    }
    if (!/^\d+$/.test(trimmed)) {
      return Number.NaN;
    }
    return Number.parseInt(trimmed, 10);
  }
  return Number.NaN;
}

export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.preprocess(
    parseTcpPort,
    z.number().int().min(MIN_TCP_PORT).max(MAX_TCP_PORT).default(3011),
  ),
  API_HOST: z.string().default('127.0.0.1'),
  ALLOWED_ORIGINS: z.string().optional(),
  WEB_PORT: z.preprocess(
    parseTcpPort,
    z.number().int().min(MIN_TCP_PORT).max(MAX_TCP_PORT).optional(),
  ),
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.preprocess(
    (val) => parseRedisPort(val),
    z
      .number()
      .int()
      .min(MIN_TCP_PORT)
      .max(MAX_TCP_PORT)
      .default(DEFAULT_REDIS_PORT),
  ),
  VAULT_PATH: z.string().optional(),
  DOCUMENT_CONVERTER_PATH: z.string().optional(),
  VOICE_PYTHON_PATH: z.string().optional(),
  DOCUMENT_PYTHON_PATH: z.string().optional(),
  VOICE_STT_MODEL: z.string().optional(),
  VOICE_STT_DEVICE: z.enum(['auto', 'cpu', 'mps', 'cuda']).optional(),
  YTDLP_PATH: z.string().optional(),
  GEMINI_CLI_PATH: z.string().optional(),
  CODEX_CLI_PATH: z.string().optional(),
  CALLIOPE_CLI_PATH: z.string().optional(),
  CALLIOPE_OPTIONAL_CLI_TIMEOUT_MS: z.preprocess(
    parseOptionalCliTimeoutMs,
    z
      .number()
      .int()
      .min(MIN_OPTIONAL_CLI_TIMEOUT_MS)
      .max(MAX_OPTIONAL_CLI_TIMEOUT_MS)
      .default(DEFAULT_OPTIONAL_CLI_TIMEOUT_MS),
  ),
  AGENT_QUEUE_NAME: z.string().min(1).optional(),
  VOICE_PORT: z.preprocess(
    parseTcpPort,
    z.number().int().min(MIN_TCP_PORT).max(MAX_TCP_PORT).optional(),
  ),
  CALLIOPE_LAUNCH_TOKEN: z.string().min(1).optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>) {
  const parsed = EnvSchema.safeParse(config);

  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Invalid environment configuration');
  }

  return parsed.data;
}

export const parseEnv = validateEnv;
