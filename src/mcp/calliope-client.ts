// Extracted from a larger private codebase (CALLIOPE). Source: apps/mcp/src/calliope-client.ts; adapted: local zod boundary replaces private contracts; injected fetch.
import { z } from "zod";
const inputSchema = z.record(z.unknown());
// The showcase only validates the top-level envelope; private per-tool contracts are omitted.
const outputSchema = z.record(z.unknown());
import { CalliopeClientError } from "./errors.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:3011/api/v1";
const MAX_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 10_000;

type Fetcher = typeof fetch;

export interface CalliopeClientOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
  identityChecked?: boolean;
}

export class CalliopeClient {
  private readonly baseUrl: URL;
  private readonly fetcher: Fetcher;
  private identityChecked: boolean;

  constructor(options: CalliopeClientOptions = {}) {
    this.baseUrl = parseLoopbackApiUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetcher = options.fetcher ?? fetch;
    this.identityChecked = options.identityChecked ?? false;
  }

  async getTodayMission(input: Record<string, unknown>): Promise<unknown> {
    const parsed = inputSchema.parse(input);
    return parseToolResponse(
      await this.read("mcp/today-mission", parsed),
      outputSchema,
    );
  }

  async prepareVoiceSession(
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const parsed = inputSchema.parse(input);
    return parseToolResponse(
      await this.write("mcp/session-packs", parsed),
      outputSchema,
    );
  }

  async markSessionPackExported(sessionPackId: string): Promise<unknown> {
    return this.write(
      `live/session-packs/${encodeURIComponent(sessionPackId)}/mark-exported`,
      {},
    );
  }

  async getProgress(input: Record<string, unknown>): Promise<unknown> {
    const parsed = inputSchema.parse(input);
    return parseToolResponse(
      await this.read("mcp/progress", parsed),
      outputSchema,
    );
  }

  async validateVoiceReport(
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const parsed = inputSchema.parse(input);
    return parseToolResponse(
      await this.write("mcp/reports/validate", parsed),
      outputSchema,
    );
  }

  async importVoiceReport(input: Record<string, unknown>): Promise<unknown> {
    const parsed = inputSchema.parse(input);
    return parseToolResponse(
      await this.write("mcp/reports/import", parsed),
      outputSchema,
    );
  }

  async confirmVoiceReport(
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const parsed = inputSchema.parse(input);
    return parseToolResponse(
      await this.write(
        `mcp/reports/${encodeURIComponent(String(parsed.reportId))}/confirm`,
        parsed,
      ),
      outputSchema,
    );
  }

  async rejectVoiceReport(input: Record<string, unknown>): Promise<unknown> {
    const parsed = inputSchema.parse(input);
    return parseToolResponse(
      await this.write(
        `mcp/reports/${encodeURIComponent(String(parsed.reportId))}/reject`,
        {},
      ),
      outputSchema,
    );
  }

  async verifyIdentity(): Promise<void> {
    if (this.identityChecked) return;
    const response = await this.request(
      "system/health",
      { method: "GET" },
      false,
    );
    if (!isRecord(response) || response.service !== "calliope-api") {
      throw new CalliopeClientError(
        "CALLIOPE API identity check failed.",
        "API_IDENTITY_MISMATCH",
      );
    }
    this.identityChecked = true;
  }

  private async read(
    path: string,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    await this.verifyIdentity();
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return this.requestUrl(url, { method: "GET" }, true);
  }

  private async write(path: string, body: unknown): Promise<unknown> {
    await this.verifyIdentity();
    return this.request(
      path,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      false,
    );
  }

  private async request(
    path: string,
    init: RequestInit,
    retryRead: boolean,
  ): Promise<unknown> {
    return this.requestUrl(new URL(path, this.baseUrl), init, retryRead);
  }

  private async requestUrl(
    url: URL,
    init: RequestInit,
    retryRead: boolean,
  ): Promise<unknown> {
    const attempts = retryRead ? 2 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          REQUEST_TIMEOUT_MS,
        );
        try {
          const response = await this.fetcher(url, {
            ...init,
            signal: controller.signal,
          });
          return await this.readResponse(response);
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
      }
    }
    throw toSafeClientError(lastError);
  }

  private async readResponse(response: Response): Promise<unknown> {
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new CalliopeClientError(
        "CALLIOPE API response exceeded the 1 MiB bridge limit.",
        "API_RESPONSE_TOO_LARGE",
      );
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new CalliopeClientError(
        "CALLIOPE API response exceeded the 1 MiB bridge limit.",
        "API_RESPONSE_TOO_LARGE",
      );
    }
    let payload: unknown;
    try {
      payload = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      throw new CalliopeClientError(
        "CALLIOPE API returned malformed JSON.",
        "API_RESPONSE_INVALID",
      );
    }
    if (!response.ok) {
      throw new CalliopeClientError(
        `CALLIOPE API request failed: HTTP ${response.status}`,
        "API_REQUEST_FAILED",
      );
    }
    return payload;
  }
}

function parseLoopbackApiUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.endsWith("/") ? raw : `${raw}/`);
  } catch {
    throw new CalliopeClientError(
      "CALLIOPE_API_BASE_URL must be a valid URL.",
      "API_REQUEST_FAILED",
    );
  }
  const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (url.protocol !== "http:" || !allowedHosts.has(url.hostname) || url.username || url.password) {
    throw new CalliopeClientError(
      "CALLIOPE MCP may call only an HTTP loopback API URL.",
      "API_REQUEST_FAILED",
    );
  }
  return url;
}

function toSafeClientError(error: unknown): CalliopeClientError {
  if (error instanceof CalliopeClientError) return error;
  const name = error instanceof Error ? error.name : "unknown error";
  return new CalliopeClientError(
    `CALLIOPE API is unavailable (${name}).`,
    "API_UNAVAILABLE",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseToolResponse(
  value: unknown,
  schema: { parse: (input: unknown) => unknown },
): unknown {
  try {
    return schema.parse(value);
  } catch {
    throw new CalliopeClientError(
      "CALLIOPE API response did not match the expected contract.",
      "API_RESPONSE_INVALID",
    );
  }
}

export { CalliopeClientError } from "./errors.js";
